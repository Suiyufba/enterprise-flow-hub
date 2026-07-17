import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const testDir = mkdtempSync(join(tmpdir(), "efh-test-"));
process.env.DB_PATH = join(testDir, "efh.db");

const dbModule = await import("../src/db/index.js");
const store = await import("../src/store.js");
const scheduler = await import("../src/automation/scheduler.js");
const { businessActionExecute } = await import("../src/tools/executors/business-action.js");
const { businessQueryExecute } = await import("../src/tools/executors/business-query.js");
const { notifyExecute } = await import("../src/tools/executors/notify.js");
const { browserCheckExecute } = await import("../src/tools/executors/browser-check.js");
const { csvProfile } = await import("../src/tools/executors/csv-profile.js");
const { createFile, getUploadRoot } = await import("../src/store/files.js");
const { registerTool } = await import("../src/tools/registry.js");
const { createRule } = await import("../src/store/rules.js");
const { emitEvent } = await import("../src/events/emitter.js");
const { setupRulesExecutor } = await import("../src/rules/executor.js");
const Fastify = (await import("fastify")).default;
const { dashboardRoutes } = await import("../src/routes/dashboard.js");

const db = dbModule.getDb();
registerTool("tool-business-action", businessActionExecute);
registerTool("tool-business-query", businessQueryExecute);
registerTool("tool-csv-profile", csvProfile);

after(() => dbModule.closeDb());

test("fresh database applies all migrations and operational MCP definitions", () => {
  assert.equal((db.pragma("integrity_check")[0] as { integrity_check: string }).integrity_check, "ok");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM enterprises").get() as { n: number }).n, 2);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM _migrations").get() as { n: number }).n, 12);
  assert.deepEqual(
    db.prepare("SELECT status,risk FROM ai_tools WHERE id='tool-business-action'").get(),
    { status: "enabled", risk: "write" },
  );
  assert.deepEqual(
    db.prepare("SELECT name,status FROM ai_tools WHERE id='tool-csv-profile'").get(),
    { name: "项目表格分析 MCP", status: "enabled" },
  );
  assert.equal(
    (db.prepare("SELECT name FROM plugins WHERE id='plugin-feishu'").get() as { name: string }).name,
    "飞书群机器人",
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM agent_personas WHERE default_skill_ids IS NULL OR default_skill_ids IN ('','[]')").get() as { n: number }).n,
    0,
  );
});

test("dashboard route returns exact totals beyond list pagination", async () => {
  const invoiceTotal = (db.prepare("SELECT COUNT(*) AS value FROM invoices WHERE enterprise_id='ent-qihang'").get() as { value: number }).value;
  const overdueTotal = (db.prepare("SELECT COUNT(*) AS value FROM invoices WHERE enterprise_id='ent-qihang' AND (status='overdue' OR (due_date < date('now','localtime') AND status NOT IN ('paid','cancelled')))").get() as { value: number }).value;
  const app = Fastify();
  app.addHook("onRequest", async (request) => {
    (request as unknown as Record<string, unknown>).actor = {
      id: "user-admin",
      enterpriseId: "ent-qihang",
      username: "admin",
      displayName: "Admin",
      role: "admin",
      createdAt: new Date().toISOString(),
    };
  });
  await app.register(dashboardRoutes);
  const response = await app.inject({ method: "GET", url: "/dashboard?enterpriseId=ent-qihang" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().invoiceTotal, invoiceTotal);
  assert.equal(response.json().overdueInvoiceCount, overdueTotal);
  await app.close();
});

test("schedule parser handles daily, workday and interval schedules", () => {
  assert.deepEqual(scheduler.parseScheduleText("每天早上9:00"), { kind: "daily", hour: 9, minute: 0, weekdaysOnly: false });
  assert.deepEqual(scheduler.parseScheduleText("每个工作日 18:30"), { kind: "daily", hour: 18, minute: 30, weekdaysOnly: true });
  assert.deepEqual(scheduler.parseScheduleText("每 30 分钟"), { kind: "interval", intervalMinutes: 30 });
  assert.deepEqual(scheduler.parseScheduleText("每6小时"), { kind: "interval", intervalMinutes: 360 });

  const automation = {
    id: "schedule-test", projectId: "proj-qihang-growth", name: "test", trigger: "每天9:00",
    triggerType: "schedule" as const, action: "test", actionType: "call_ai" as const,
    actionInput: {}, enabled: true, runCount: 0, lastRun: "2026-07-16T01:00:00.000Z",
  };
  assert.equal(scheduler.isAutomationDue(automation, new Date("2026-07-17T01:05:00.000Z"), "Asia/Shanghai"), true);
});

test("business MCP queries are enterprise scoped and writes are persisted", async () => {
  const dashboard = JSON.parse(await businessQueryExecute({ _enterpriseId: "ent-qihang", resource: "dashboard" }));
  assert.equal(dashboard.ok, true);
  assert.ok(dashboard.summary.customers >= 5);
  const invoices = JSON.parse(await businessQueryExecute({ _enterpriseId: "ent-qihang", resource: "invoices", limit: 3 }));
  const invoiceTotal = (db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE enterprise_id='ent-qihang'").get() as { n: number }).n;
  assert.equal(invoices.total, invoiceTotal);
  assert.equal(invoices.returned, Math.min(3, invoiceTotal));
  const overdue = JSON.parse(await businessQueryExecute({ _enterpriseId: "ent-qihang", resource: "invoices", status: "overdue", limit: 3 }));
  const overdueTotal = (db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE enterprise_id='ent-qihang' AND (status='overdue' OR (due_date < date('now','localtime') AND status NOT IN ('paid','cancelled')))").get() as { n: number }).n;
  assert.equal(overdue.total, overdueTotal);

  const customer = JSON.parse(await businessActionExecute({
    _enterpriseId: "ent-qihang", operation: "create_customer", name: "测试客户", phone: "13812345678", status: "lead",
  }));
  assert.equal(customer.ok, true);
  assert.equal((db.prepare("SELECT enterprise_id FROM customers WHERE id=?").get(customer.customer.id) as { enterprise_id: string }).enterprise_id, "ent-qihang");

  const task = JSON.parse(await businessActionExecute({
    _enterpriseId: "ent-qihang", operation: "create_task", title: "测试待办", priority: "high",
  }));
  assert.equal(task.ok, true);
  assert.equal((db.prepare("SELECT status FROM tasks WHERE id=?").get(task.task.id) as { status: string }).status, "pending");
});

test("customer duplicate audit scans the full enterprise beyond the returned page", async () => {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO customers (id,enterprise_id,name,contact,phone,email,address,tags,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  insert.run("cust-duplicate-a", "ent-qihang", "同名候选", "A", "+86 139-8888-7777", "Duplicate@Example.com", "", "[]", "lead", now, now);
  insert.run("cust-duplicate-b", "ent-qihang", "同名候选", "B", "13988887777", "duplicate@example.com", "", "[]", "lead", now, now);

  try {
    const total = (db.prepare("SELECT COUNT(*) AS n FROM customers WHERE enterprise_id='ent-qihang'").get() as { n: number }).n;
    const page = JSON.parse(await businessQueryExecute({ _enterpriseId: "ent-qihang", resource: "customers", limit: 1 }));
    assert.equal(page.returned, 1);
    assert.equal(page.total, total);
    assert.equal(page.duplicateAnalysis.scannedCustomers, total);
    assert.equal(page.duplicateAnalysis.completeScan, true);
    assert.ok(page.duplicateAnalysis.duplicatePhoneGroups >= 1);

    const audit = JSON.parse(await businessQueryExecute({
      _enterpriseId: "ent-qihang",
      resource: "customer_duplicates",
      limit: 50,
    }));
    assert.equal(audit.summary.scannedCustomers, total);
    assert.equal(audit.summary.completeScan, true);
    assert.equal(audit.summary.hasStrongDuplicates, true);
    assert.deepEqual(
      audit.phoneGroups.find((group: { normalizedValue: string }) => group.normalizedValue === "13988887777")?.customers.map((customer: { id: string }) => customer.id),
      ["cust-duplicate-a", "cust-duplicate-b"],
    );
    assert.equal(
      audit.emailGroups.find((group: { normalizedValue: string }) => group.normalizedValue === "duplicate@example.com")?.count,
      2,
    );
    assert.equal(
      audit.sameNameCandidateGroups.find((group: { normalizedValue: string }) => group.normalizedValue === "同名候选")?.count,
      2,
    );
  } finally {
    db.prepare("DELETE FROM customers WHERE id IN ('cust-duplicate-a','cust-duplicate-b')").run();
  }
});

test("table MCP reads a project upload and parses quoted CSV cells", async () => {
  const storagePath = join(testDir, "customers.csv");
  writeFileSync(storagePath, 'name,phone,note\n"Alice, A",13800000000,"priority, lead"\nBob,,normal\n');
  const file = createFile({
    enterpriseId: "ent-qihang",
    filename: "customers.csv",
    mimeType: "text/csv",
    size: 76,
    storagePath,
    relatedType: "project",
    relatedId: "proj-qihang-growth",
  });
  const run = await store.runTool("tool-csv-profile", {
    input: {
      _enterpriseId: "ent-qihang",
      _projectId: "proj-qihang-growth",
      fileId: file.id,
      sampleRows: 10,
    },
  });
  assert.equal(run?.status, "success");
  const profile = JSON.parse(run?.output ?? "{}");
  assert.equal(profile.ok, true);
  assert.deepEqual(profile.headers, ["name", "phone", "note"]);
  assert.deepEqual(profile.sampleRows[0], ["Alice, A", "13800000000", "priority, lead"]);
  assert.equal(profile.totalRows, 2);
});

test("upload storage follows the persistent database volume", () => {
  assert.equal(getUploadRoot({ DB_PATH: "/data/efh.db" }, "/app/backend"), "/data/uploads");
  assert.equal(
    getUploadRoot({ DB_PATH: "/data/efh.db", UPLOAD_DIR: "/mnt/files" }, "/app/backend"),
    "/mnt/files",
  );
  assert.equal(getUploadRoot({}, "/app/backend"), "/app/backend/data/uploads");
});

test("write tools never mutate data during a default dry run", async () => {
  const before = (db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE enterprise_id='ent-qihang'").get() as { n: number }).n;
  const run = await store.runTool("tool-business-action", {
    input: { _enterpriseId: "ent-qihang", operation: "create_task", title: "不应创建" },
  });
  assert.equal(run?.status, "success");
  assert.deepEqual(JSON.parse(run?.output ?? "{}"), {
    ok: true,
    dryRun: true,
    toolId: "tool-business-action",
    message: "预览已通过，未执行任何写入或外部通知",
  });
  const after = (db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE enterprise_id='ent-qihang'").get() as { n: number }).n;
  assert.equal(after, before);
});

test("tools without an executor fail instead of generating simulated output", async () => {
  const run = await store.runTool("tool-mcp-company-context", {
    input: { _enterpriseId: "ent-qihang", _projectId: "proj-qihang-growth" },
  });
  assert.equal(run?.status, "error");
  assert.deepEqual(JSON.parse(run?.output ?? "{}"), {
    ok: false,
    error: "工具 项目上下文 MCP 尚未接入执行器",
  });
});

test("tool errors are recorded as errors rather than successful runs", async () => {
  const run = await store.runTool("tool-business-action", {
    input: { _enterpriseId: "ent-qihang", operation: "not_supported" },
    dryRun: false,
  });
  assert.equal(run?.status, "error");
  assert.match(run?.output ?? "", /不支持的业务操作/);
});

test("tool-call automation executes the real action and records output", async () => {
  const before = (db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE enterprise_id='ent-qihang'").get() as { n: number }).n;
  const automation = store.createAutomation({
    projectId: "proj-qihang-growth",
    name: "自动化测试待办",
    trigger: "手动",
    triggerType: "manual",
    action: "创建测试待办",
    actionType: "tool_call",
    actionToolId: "tool-business-action",
    actionInput: { operation: "create_task", title: "自动化创建", priority: "medium" },
  });
  assert.ok(automation);
  const result = await scheduler.runAutomationNow(automation.id, { source: "test" });
  assert.equal(result?.lastStatus, "success");
  assert.equal(result?.runCount, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE enterprise_id='ent-qihang'").get() as { n: number }).n, before + 1);
  assert.equal((db.prepare("SELECT status FROM automation_runs WHERE automation_id=?").get(automation.id) as { status: string }).status, "success");
});

test("unsupported automation triggers and actions cannot be enabled", () => {
  assert.throws(() => store.createAutomation({
    projectId: "proj-qihang-growth",
    name: "未接入邮件任务",
    trigger: "收到邮件",
    triggerType: "email",
    action: "分析邮件",
    actionType: "call_ai",
  }), /邮件触发尚未接入/);
  assert.throws(() => store.createAutomation({
    projectId: "proj-qihang-growth",
    name: "未接入脚本任务",
    trigger: "手动",
    triggerType: "manual",
    action: "执行脚本",
    actionType: "shell",
  }), /尚未接入执行器/);
});

test("message and file triggers execute only matching project automations", async () => {
  const before = (db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE enterprise_id='ent-qihang'").get() as { n: number }).n;
  const failingAutomation = store.createAutomation({
    projectId: "proj-qihang-growth",
    name: "失败不阻断后续任务",
    trigger: "收到项目消息",
    triggerType: "message",
    action: "调用不存在的业务工具",
    actionType: "tool_call",
    actionToolId: "tool-does-not-exist",
  });
  const messageAutomation = store.createAutomation({
    projectId: "proj-qihang-growth",
    name: "消息触发验收",
    trigger: "收到项目消息",
    triggerType: "message",
    action: "创建消息待办",
    actionType: "tool_call",
    actionToolId: "tool-business-action",
    actionInput: { operation: "create_task", title: "消息触发待办", priority: "medium" },
  });
  const fileAutomation = store.createAutomation({
    projectId: "proj-qihang-growth",
    name: "文件触发验收",
    trigger: "项目文件上传",
    triggerType: "file",
    action: "创建文件待办",
    actionType: "tool_call",
    actionToolId: "tool-business-action",
    actionInput: { operation: "create_task", title: "文件触发待办", priority: "medium" },
  });
  assert.ok(failingAutomation && messageAutomation && fileAutomation);

  const messageRuns = await scheduler.triggerProjectAutomations("message", "proj-qihang-growth", { content: "测试消息" });
  const fileRuns = await scheduler.triggerProjectAutomations("file", "proj-qihang-growth", { filename: "test.csv" });
  assert.equal(messageRuns.some((run) => run.id === messageAutomation.id), true);
  assert.equal(fileRuns.some((run) => run.id === fileAutomation.id), true);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE enterprise_id='ent-qihang'").get() as { n: number }).n, before + 2);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM automation_runs WHERE automation_id IN (?,?) AND status='success'").get(messageAutomation.id, fileAutomation.id) as { n: number }).n, 2);
  assert.equal((db.prepare("SELECT last_status FROM automations WHERE id=?").get(failingAutomation.id) as { last_status: string }).last_status, "error");
});

test("Feishu and WeCom notification payloads use provider-specific formats", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ code: 0, errcode: 0 }), { status: 200 });
  };
  try {
    store.updatePluginConfig("plugin-feishu", { webhookUrl: "https://open.feishu.cn/test" });
    store.setPluginEnabled("plugin-feishu", true);
    store.updatePluginConfig("plugin-wecom", { webhookUrl: "https://qyapi.weixin.qq.com/test" });
    store.setPluginEnabled("plugin-wecom", true);
    assert.equal(JSON.parse(await notifyExecute({ pluginId: "plugin-feishu", message: "飞书测试" })).ok, true);
    assert.equal(JSON.parse(await notifyExecute({ pluginId: "plugin-wecom", message: "企微测试" })).ok, true);
    assert.deepEqual(bodies[0], { msg_type: "text", content: { text: "飞书测试" } });
    assert.deepEqual(bodies[1], { msgtype: "text", text: { content: "企微测试" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rule events create tasks and are marked processed", async () => {
  setupRulesExecutor();
  createRule({
    enterpriseId: "ent-qihang",
    name: "新客户建待办",
    objectType: "customer",
    triggerEvent: "create",
    conditionExpr: { logic: "and", conditions: [] },
    actionType: "create_task",
    actionConfig: { title: "跟进新客户", priority: "high" },
  });
  const order = db.prepare("SELECT id FROM orders WHERE enterprise_id='ent-qihang' LIMIT 1").get() as { id: string };
  createRule({
    enterpriseId: "ent-qihang",
    name: "订单自动交付",
    objectType: "order",
    triggerEvent: "update",
    conditionExpr: { logic: "and", conditions: [] },
    actionType: "set_field",
    actionConfig: { table: "orders", field: "status", value: "delivered" },
  });
  const event = emitEvent("create", "customer", "cust-event-test", { enterpriseId: "ent-qihang" }, "test");
  const orderEvent = emitEvent("update", "order", order.id, { enterpriseId: "ent-qihang" }, "test");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal((db.prepare("SELECT processed FROM business_events WHERE id=?").get(event.id) as { processed: number }).processed, 1);
  assert.equal((db.prepare("SELECT processed FROM business_events WHERE id=?").get(orderEvent.id) as { processed: number }).processed, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE source_id='cust-event-test'").get() as { n: number }).n, 1);
  assert.equal((db.prepare("SELECT status FROM orders WHERE id=?").get(order.id) as { status: string }).status, "delivered");
});

test("browser checker blocks local and private targets", async () => {
  await assert.rejects(() => browserCheckExecute({ url: "http://127.0.0.1:4000" }), /公开 HTTP\/HTTPS/);
  await assert.rejects(() => browserCheckExecute({ url: "http://localhost" }), /公开 HTTP\/HTTPS/);
});

import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { join } from "node:path";

// P4: automation trigger paths. Verifies that (a) a webhook POST with the
// correct secret executes the automation and persists an automation_runs
// row, and (b) the durable scheduler picks up a never-run interval
// automation, enqueues an automation_jobs row and completes it through the
// stub LLM. Runs serially against the shared backend fixture from
// playwright.config.ts (fresh seeded DB, provider pointed at stub-ai).

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const DB_PATH = join(__dirname, "../backend/e2e/.tmp/efh-e2e.db");

const require = createRequire(join(__dirname, "../backend/package.json"));
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

type Actor = { token: string; enterpriseId: string };

let actor: Actor;
let projectId: string;

function openDb() {
  return new Database(DB_PATH, { readonly: true });
}

test.beforeAll(async () => {
  // Log in through the real API, then resolve a seeded project from the DB.
  const login = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "demo123" }),
  });
  expect(login.status).toBe(200);
  const body = (await login.json()) as Actor & { username: string };
  actor = { token: body.token, enterpriseId: body.enterpriseId };
  expect(actor.token).toBeTruthy();

  const db = openDb();
  const row = db.prepare("SELECT id FROM projects ORDER BY created_at, id LIMIT 1").get() as { id: string } | undefined;
  db.close();
  expect(row?.id).toBeTruthy();
  projectId = row!.id;
});

async function createAutomation(overrides: Record<string, unknown>) {
  const response = await fetch(`${BACKEND_URL}/automations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${actor.token}` },
    body: JSON.stringify({
      projectId,
      name: `E2E 触发 ${Date.now()}`,
      trigger: "测试触发条件",
      triggerType: "webhook",
      action: "用 AI 分析触发载荷并输出结果",
      actionType: "call_ai",
      ...overrides,
    }),
  });
  expect([200, 201]).toContain(response.status);
  return (await response.json()) as { id: string; webhookSecret?: string };
}

test.describe("自动化触发链路", () => {
  test("webhook：带密钥 POST 触发并落库，错误密钥被拒绝", async () => {
    const automation = await createAutomation({ triggerType: "webhook" });
    expect(automation.webhookSecret).toBeTruthy();

    // Wrong secret -> 401, nothing persisted.
    const rejected = await fetch(`${BACKEND_URL}/automations/${automation.id}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-efh-webhook-secret": "wrong-secret" },
      body: JSON.stringify({ message: "should-not-run" }),
    });
    expect(rejected.status).toBe(401);

    // Correct secret -> executed synchronously.
    const accepted = await fetch(`${BACKEND_URL}/automations/${automation.id}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-efh-webhook-secret": automation.webhookSecret! },
      body: JSON.stringify({ source: "p4-webhook", message: "你好，webhook" }),
    });
    expect(accepted.status).toBe(200);
    const acceptedBody = (await accepted.json()) as { ok: boolean };
    expect(acceptedBody.ok).toBe(true);

    // The run is persisted with the webhook event payload.
    const db = openDb();
    const run = db.prepare(
      `SELECT status, trigger_event, output FROM automation_runs
       WHERE automation_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(automation.id) as { status: string; trigger_event: string; output: string } | undefined;
    const meta = db.prepare("SELECT run_count, last_status FROM automations WHERE id = ?").get(automation.id) as
      { run_count: number; last_status: string };
    db.close();

    expect(run?.status).toBe("success");
    expect(run!.trigger_event).toContain('"source":"webhook"');
    expect(run!.trigger_event).toContain("p4-webhook");
    expect(run!.output.length).toBeGreaterThan(0);
    expect(meta.run_count).toBeGreaterThanOrEqual(1);
    expect(meta.last_status).toBe("success");
  });

  test("定时任务：从未运行的 interval 自动化被调度执行并完成落库", async () => {
    const automation = await createAutomation({
      triggerType: "schedule",
      trigger: "每60分钟",
    });

    // The scheduler runs with AUTOMATION_POLL_MS=1000 / JOB_POLL_MS=500 in
    // the E2E backend, and a never-run interval automation is due on the
    // first scan. Poll the durable queue and the runs table for completion.
    let jobStatus: string | undefined;
    let runStatus: string | undefined;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const db = openDb();
      const job = db.prepare(
        `SELECT status FROM automation_jobs
         WHERE automation_id = ? AND trigger_source = 'schedule' ORDER BY created_at DESC LIMIT 1`,
      ).get(automation.id) as { status: string } | undefined;
      const run = db.prepare(
        `SELECT status FROM automation_runs WHERE automation_id = ? ORDER BY created_at DESC LIMIT 1`,
      ).get(automation.id) as { status: string } | undefined;
      db.close();
      jobStatus = job?.status;
      runStatus = run?.status;
      if (jobStatus === "success" && runStatus === "success") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    expect(jobStatus).toBe("success");
    expect(runStatus).toBe("success");

    // run_count on the automation row is updated by the job execution.
    const db = openDb();
    const meta = db.prepare("SELECT run_count, last_status, last_run FROM automations WHERE id = ?").get(automation.id) as
      { run_count: number; last_status: string; last_run: string | null };
    db.close();
    expect(meta.run_count).toBeGreaterThanOrEqual(1);
    expect(meta.last_status).toBe("success");
    expect(meta.last_run).toBeTruthy();
  });
});

import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";
import { listCustomersByNormalizedPhone, listDuplicatePhoneGroups } from "../customer-duplicates.js";
import { resolveProjectId } from "../../project-scope.js";

const INVOICE_STATUSES = new Set(["draft", "issued", "paid", "overdue", "cancelled"]);
const ORDER_STATUSES = new Set(["draft", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]);
const CUSTOMER_STATUSES = new Set(["active", "inactive", "lead", "lost"]);
const CUSTOMER_GENDERS = new Set(["unknown", "male", "female", "other"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

function text(input: Record<string, unknown>, key: string): string {
  return typeof input[key] === "string" ? input[key].trim() : "";
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function updateCustomer(input: Record<string, unknown>, enterpriseId: string, projectId: string) {
  const db = getDb();
  let id = text(input, "id");
  if (!id) {
    const phone = normalizePhone(text(input, "phone"));
    if (!phone) throw new Error("更新客户资料需要客户 ID，或当前业务子类内唯一的 phone");
    const matches = (db.prepare(
      "SELECT id, phone FROM customers WHERE enterprise_id=? AND project_id=? AND phone<>''",
    ).all(enterpriseId, projectId) as Array<{ id: string; phone: string }>)
      .filter((customer) => normalizePhone(customer.phone) === phone);
    if (matches.length === 0) throw new Error("未找到该手机号对应的客户");
    if (matches.length > 1) throw new Error("该手机号匹配多个客户，请先查询并使用客户 ID 更新");
    id = matches[0].id;
  }

  const updates: Array<[string, string]> = [];
  for (const field of ["name", "contact", "phone", "email", "address"] as const) {
    if (typeof input[field] === "string") updates.push([field, text(input, field)]);
  }
  if (typeof input.gender === "string") {
    const gender = text(input, "gender");
    if (!CUSTOMER_GENDERS.has(gender)) throw new Error("客户性别无效");
    updates.push(["gender", gender]);
  }
  if (typeof input.status === "string") {
    const status = text(input, "status");
    if (!CUSTOMER_STATUSES.has(status)) throw new Error("客户状态无效");
    updates.push(["status", status]);
  }
  if (Array.isArray(input.tags)) {
    const tags = [...new Set(input.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
    updates.push(["tags", JSON.stringify(tags)]);
  }
  if (updates.length === 0) throw new Error("没有可更新的客户资料字段");

  const result = db.prepare(
    `UPDATE customers SET ${updates.map(([field]) => `${field}=?`).join(", ")}, updated_at=?
     WHERE id=? AND enterprise_id=? AND project_id=?`,
  ).run(...updates.map(([, value]) => value), new Date().toISOString(), id, enterpriseId, projectId);
  if (result.changes !== 1) throw new Error("客户不存在或不属于当前业务子类");
  return db.prepare(
    "SELECT id,name,contact,phone,email,address,gender,tags,status,project_id FROM customers WHERE id=?",
  ).get(id);
}

function updateStatus(table: string, id: string, enterpriseId: string, projectId: string, status: string, allowed: Set<string>) {
  if (!id || !allowed.has(status)) throw new Error(`无效的 ${table} ID 或状态`);
  const db = getDb();
  const hasUpdatedAt = table !== "invoices";
  const sql = hasUpdatedAt
    ? `UPDATE ${table} SET status=?, updated_at=? WHERE id=? AND enterprise_id=? AND project_id=?`
    : `UPDATE ${table} SET status=? WHERE id=? AND enterprise_id=? AND project_id=?`;
  const result = hasUpdatedAt
    ? db.prepare(sql).run(status, new Date().toISOString(), id, enterpriseId, projectId)
    : db.prepare(sql).run(status, id, enterpriseId, projectId);
  if (result.changes !== 1) throw new Error("记录不存在或不属于当前项目");
  return { id, status };
}

function deduplicateCustomers(enterpriseId: string, projectId: string) {
  const db = getDb();
  const duplicatePhones = listDuplicatePhoneGroups(enterpriseId, projectId);

  let merged = 0;
  let ordersMoved = 0;
  let invoicesMoved = 0;
  const merge = db.transaction(() => {
    for (const duplicate of duplicatePhones) {
      const customers = listCustomersByNormalizedPhone(enterpriseId, duplicate.key, projectId);
      const keeper = customers[0];
      if (!keeper) continue;
      for (const duplicateCustomer of customers.slice(1)) {
        const duplicateId = duplicateCustomer.id as string;
        const keeperId = keeper.id as string;
        ordersMoved += db.prepare("UPDATE orders SET customer_id=? WHERE customer_id=? AND enterprise_id=? AND project_id=?").run(keeperId, duplicateId, enterpriseId, projectId).changes;
        invoicesMoved += db.prepare("UPDATE invoices SET customer_id=? WHERE customer_id=? AND enterprise_id=? AND project_id=?").run(keeperId, duplicateId, enterpriseId, projectId).changes;
        merged += db.prepare("DELETE FROM customers WHERE id=? AND enterprise_id=? AND project_id=?").run(duplicateId, enterpriseId, projectId).changes;
      }
    }
  });
  merge();
  return { duplicatePhoneGroups: duplicatePhones.length, mergedCustomers: merged, ordersMoved, invoicesMoved };
}

export async function businessActionExecute(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = text(input, "_enterpriseId");
  const operation = text(input, "operation");
  if (!enterpriseId) throw new Error("缺少当前企业上下文");
  const projectId = resolveProjectId(enterpriseId, text(input, "_projectId") || undefined);

  if (operation === "create_task") {
    const title = text(input, "title");
    if (!title) throw new Error("创建待办需要 title");
    const priority = text(input, "priority") || "medium";
    if (!TASK_PRIORITIES.has(priority)) throw new Error("待办优先级无效");
    const id = `task-${randomUUID()}`;
    const now = new Date().toISOString();
    getDb().prepare(
      `INSERT INTO tasks (id,enterprise_id,project_id,assignee_id,title,description,status,priority,due_date,source_type,source_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?,?)`,
    ).run(
      id, enterpriseId, projectId, text(input, "assigneeId") || null, title, text(input, "description"), priority,
      text(input, "dueDate") || null, text(input, "sourceType") || "agent", text(input, "sourceId") || null, now, now,
    );
    return JSON.stringify({ ok: true, operation, task: { id, projectId, title, priority, dueDate: text(input, "dueDate") || null } });
  }

  if (operation === "create_customer") {
    const name = text(input, "name");
    if (!name) throw new Error("创建客户需要 name");
    const status = text(input, "status") || "lead";
    if (!CUSTOMER_STATUSES.has(status)) throw new Error("客户状态无效");
    const gender = text(input, "gender") || "unknown";
    if (!CUSTOMER_GENDERS.has(gender)) throw new Error("客户性别无效");
    const id = `cust-${randomUUID()}`;
    const now = new Date().toISOString();
    const tags = Array.isArray(input.tags)
      ? [...new Set(input.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20)
      : [];
    getDb().prepare(
      `INSERT INTO customers (id,enterprise_id,project_id,name,contact,phone,email,address,gender,tags,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, enterpriseId, projectId, name, text(input, "contact"), text(input, "phone"), text(input, "email"),
      text(input, "address"), gender, JSON.stringify(tags), status, now, now,
    );
    return JSON.stringify({ ok: true, operation, customer: { id, projectId, name, gender, tags, status } });
  }

  if (operation === "update_invoice_status") {
    return JSON.stringify({ ok: true, operation, result: updateStatus("invoices", text(input, "id"), enterpriseId, projectId, text(input, "status"), INVOICE_STATUSES) });
  }
  if (operation === "update_order_status") {
    return JSON.stringify({ ok: true, operation, result: updateStatus("orders", text(input, "id"), enterpriseId, projectId, text(input, "status"), ORDER_STATUSES) });
  }
  if (operation === "update_customer_status") {
    return JSON.stringify({ ok: true, operation, result: updateStatus("customers", text(input, "id"), enterpriseId, projectId, text(input, "status"), CUSTOMER_STATUSES) });
  }
  if (operation === "update_customer") {
    return JSON.stringify({ ok: true, operation, customer: updateCustomer(input, enterpriseId, projectId) });
  }
  if (operation === "deduplicate_customers_by_phone") {
    return JSON.stringify({ ok: true, operation, result: deduplicateCustomers(enterpriseId, projectId) });
  }

  throw new Error(`不支持的业务操作：${operation || "未指定"}`);
}

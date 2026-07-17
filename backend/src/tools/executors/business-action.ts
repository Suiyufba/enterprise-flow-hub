import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";
import { listCustomersByNormalizedPhone, listDuplicatePhoneGroups } from "../customer-duplicates.js";

const INVOICE_STATUSES = new Set(["draft", "issued", "paid", "overdue", "cancelled"]);
const ORDER_STATUSES = new Set(["draft", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]);
const CUSTOMER_STATUSES = new Set(["active", "inactive", "lead", "lost"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

function text(input: Record<string, unknown>, key: string): string {
  return typeof input[key] === "string" ? input[key].trim() : "";
}

function updateStatus(table: string, id: string, enterpriseId: string, status: string, allowed: Set<string>) {
  if (!id || !allowed.has(status)) throw new Error(`无效的 ${table} ID 或状态`);
  const db = getDb();
  const hasUpdatedAt = table !== "invoices";
  const sql = hasUpdatedAt
    ? `UPDATE ${table} SET status=?, updated_at=? WHERE id=? AND enterprise_id=?`
    : `UPDATE ${table} SET status=? WHERE id=? AND enterprise_id=?`;
  const result = hasUpdatedAt
    ? db.prepare(sql).run(status, new Date().toISOString(), id, enterpriseId)
    : db.prepare(sql).run(status, id, enterpriseId);
  if (result.changes !== 1) throw new Error("记录不存在或不属于当前企业");
  return { id, status };
}

function deduplicateCustomers(enterpriseId: string) {
  const db = getDb();
  const duplicatePhones = listDuplicatePhoneGroups(enterpriseId);

  let merged = 0;
  let ordersMoved = 0;
  let invoicesMoved = 0;
  const merge = db.transaction(() => {
    for (const duplicate of duplicatePhones) {
      const customers = listCustomersByNormalizedPhone(enterpriseId, duplicate.key);
      const keeper = customers[0];
      if (!keeper) continue;
      for (const duplicateCustomer of customers.slice(1)) {
        const duplicateId = duplicateCustomer.id as string;
        const keeperId = keeper.id as string;
        ordersMoved += db.prepare("UPDATE orders SET customer_id=? WHERE customer_id=? AND enterprise_id=?").run(keeperId, duplicateId, enterpriseId).changes;
        invoicesMoved += db.prepare("UPDATE invoices SET customer_id=? WHERE customer_id=? AND enterprise_id=?").run(keeperId, duplicateId, enterpriseId).changes;
        merged += db.prepare("DELETE FROM customers WHERE id=? AND enterprise_id=?").run(duplicateId, enterpriseId).changes;
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

  if (operation === "create_task") {
    const title = text(input, "title");
    if (!title) throw new Error("创建待办需要 title");
    const priority = text(input, "priority") || "medium";
    if (!TASK_PRIORITIES.has(priority)) throw new Error("待办优先级无效");
    const id = `task-${randomUUID()}`;
    const now = new Date().toISOString();
    getDb().prepare(
      `INSERT INTO tasks (id,enterprise_id,assignee_id,title,description,status,priority,due_date,source_type,source_id,created_at,updated_at)
       VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?)`,
    ).run(
      id, enterpriseId, text(input, "assigneeId") || null, title, text(input, "description"), priority,
      text(input, "dueDate") || null, text(input, "sourceType") || "agent", text(input, "sourceId") || null, now, now,
    );
    return JSON.stringify({ ok: true, operation, task: { id, title, priority, dueDate: text(input, "dueDate") || null } });
  }

  if (operation === "create_customer") {
    const name = text(input, "name");
    if (!name) throw new Error("创建客户需要 name");
    const status = text(input, "status") || "lead";
    if (!CUSTOMER_STATUSES.has(status)) throw new Error("客户状态无效");
    const id = `cust-${randomUUID()}`;
    const now = new Date().toISOString();
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20) : [];
    getDb().prepare(
      `INSERT INTO customers (id,enterprise_id,name,contact,phone,email,address,tags,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, enterpriseId, name, text(input, "contact"), text(input, "phone"), text(input, "email"),
      text(input, "address"), JSON.stringify(tags), status, now, now,
    );
    return JSON.stringify({ ok: true, operation, customer: { id, name, status } });
  }

  if (operation === "update_invoice_status") {
    return JSON.stringify({ ok: true, operation, result: updateStatus("invoices", text(input, "id"), enterpriseId, text(input, "status"), INVOICE_STATUSES) });
  }
  if (operation === "update_order_status") {
    return JSON.stringify({ ok: true, operation, result: updateStatus("orders", text(input, "id"), enterpriseId, text(input, "status"), ORDER_STATUSES) });
  }
  if (operation === "update_customer_status") {
    return JSON.stringify({ ok: true, operation, result: updateStatus("customers", text(input, "id"), enterpriseId, text(input, "status"), CUSTOMER_STATUSES) });
  }
  if (operation === "deduplicate_customers_by_phone") {
    return JSON.stringify({ ok: true, operation, result: deduplicateCustomers(enterpriseId) });
  }

  throw new Error(`不支持的业务操作：${operation || "未指定"}`);
}

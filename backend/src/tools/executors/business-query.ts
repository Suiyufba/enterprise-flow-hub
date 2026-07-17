import { getDb } from "../../db/index.js";
import { customerDuplicateReport } from "../customer-duplicates.js";

type ResourceConfig = {
  table: string;
  columns: string;
  statusColumn?: string;
  searchColumns?: string[];
  orderBy: string;
};

const RESOURCES: Record<string, ResourceConfig> = {
  customers: { table: "customers", columns: "id,name,contact,phone,email,status,created_at,updated_at", statusColumn: "status", searchColumns: ["name", "contact", "phone", "email"], orderBy: "updated_at DESC" },
  suppliers: { table: "suppliers", columns: "id,name,contact,phone,email,created_at,updated_at", searchColumns: ["name", "contact", "phone", "email"], orderBy: "updated_at DESC" },
  products: { table: "products", columns: "id,name,sku,category,unit_price,unit,updated_at", searchColumns: ["name", "sku", "category"], orderBy: "updated_at DESC" },
  orders: { table: "orders", columns: "id,customer_id,status,total_amount,notes,created_at,updated_at", statusColumn: "status", searchColumns: ["id", "notes"], orderBy: "updated_at DESC" },
  payments: { table: "payments", columns: "id,order_id,amount,method,status,received_at,created_at", statusColumn: "status", searchColumns: ["id", "order_id"], orderBy: "created_at DESC" },
  invoices: { table: "invoices", columns: "id,order_id,customer_id,invoice_number,amount,total_amount,status,due_date,issued_at,buyer_name,seller_name,created_at", statusColumn: "status", searchColumns: ["id", "invoice_number", "buyer_name", "seller_name"], orderBy: "created_at DESC" },
  tasks: { table: "tasks", columns: "id,assignee_id,title,description,status,priority,due_date,source_type,source_id,created_at,updated_at", statusColumn: "status", searchColumns: ["title", "description"], orderBy: "created_at DESC" },
};

function boundedLimit(value: unknown): number {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.trunc(parsed))) : 20;
}

function dashboard(enterpriseId: string) {
  const db = getDb();
  const count = (table: string, extra = "", params: unknown[] = []) =>
    (db.prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE enterprise_id = ? ${extra}`).get(enterpriseId, ...params) as { value: number }).value;
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) AS value FROM payments WHERE enterprise_id = ? AND status = 'completed'").get(enterpriseId) as { value: number };
  return {
    customers: count("customers"),
    orders: count("orders"),
    pendingOrders: count("orders", "AND status IN ('confirmed','processing')"),
    paymentsReceived: paid.value,
    invoices: count("invoices"),
    overdueInvoices: count("invoices", "AND (status = 'overdue' OR (due_date < date('now') AND status NOT IN ('paid','cancelled')))"),
    openTasks: count("tasks", "AND status IN ('pending','in_progress')"),
  };
}

export async function businessQueryExecute(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = typeof input._enterpriseId === "string" ? input._enterpriseId : "";
  const resource = typeof input.resource === "string" ? input.resource.trim().toLowerCase() : "dashboard";
  if (!enterpriseId) throw new Error("缺少当前企业上下文");

  if (resource === "dashboard") {
    return JSON.stringify({ ok: true, resource, summary: dashboard(enterpriseId) });
  }

  if (resource === "customer_duplicates") {
    return JSON.stringify({
      ok: true,
      resource,
      ...customerDuplicateReport(enterpriseId, boundedLimit(input.limit)),
    });
  }

  if (resource === "automations") {
    const total = (getDb().prepare(
      "SELECT COUNT(*) AS value FROM automations a JOIN projects p ON p.id=a.project_id WHERE p.enterprise_id=?",
    ).get(enterpriseId) as { value: number }).value;
    const rows = getDb().prepare(
      `SELECT a.id,a.name,a.trigger_type,a.trigger_desc,a.action_type,a.action_desc,a.enabled,a.run_count,a.last_run,a.last_status,a.last_error
       FROM automations a JOIN projects p ON p.id=a.project_id
       WHERE p.enterprise_id=? ORDER BY a.enabled DESC,a.name LIMIT ?`,
    ).all(enterpriseId, boundedLimit(input.limit));
    return JSON.stringify({ ok: true, resource, total, returned: rows.length, items: rows });
  }

  if (resource === "library") {
    const total = (getDb().prepare("SELECT COUNT(*) AS value FROM library_items WHERE enterprise_id=?").get(enterpriseId) as { value: number }).value;
    const rows = getDb().prepare(
      "SELECT id,project_id,name,type,summary,visibility,created_at FROM library_items WHERE enterprise_id=? ORDER BY created_at DESC LIMIT ?",
    ).all(enterpriseId, boundedLimit(input.limit));
    return JSON.stringify({ ok: true, resource, total, returned: rows.length, items: rows });
  }

  const config = RESOURCES[resource];
  if (!config) throw new Error(`不支持的业务资源：${resource}`);
  const where = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  const status = typeof input.status === "string" ? input.status.trim() : "";
  const search = typeof input.search === "string" ? input.search.trim() : "";
  if (status && config.statusColumn) {
    if (resource === "invoices" && status === "overdue") {
      where.push("(status = 'overdue' OR (due_date < date('now','localtime') AND status NOT IN ('paid','cancelled')))" );
    } else {
      where.push(`${config.statusColumn} = ?`);
      params.push(status);
    }
  }
  if (search && config.searchColumns?.length) {
    where.push(`(${config.searchColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    for (let index = 0; index < config.searchColumns.length; index += 1) params.push(`%${search}%`);
  }
  const limit = boundedLimit(input.limit);
  const total = (getDb().prepare(
    `SELECT COUNT(*) AS value FROM ${config.table} WHERE ${where.join(" AND ")}`,
  ).get(...params) as { value: number }).value;
  const rows = getDb().prepare(
    `SELECT ${config.columns} FROM ${config.table} WHERE ${where.join(" AND ")} ORDER BY ${config.orderBy} LIMIT ?`,
  ).all(...params, limit);
  const result: Record<string, unknown> = { ok: true, resource, total, returned: rows.length, items: rows };
  if (resource === "customers") {
    result.duplicateAnalysis = customerDuplicateReport(enterpriseId, 0).summary;
  }
  return JSON.stringify(result);
}

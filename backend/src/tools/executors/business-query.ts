import { getDb } from "../../db/index.js";
import { customerDuplicateReport } from "../customer-duplicates.js";
import { resolveProjectId } from "../../project-scope.js";

type ResourceConfig = {
  table: string;
  columns: string;
  statusColumn?: string;
  searchColumns?: string[];
  orderBy: string;
};

const RESOURCES: Record<string, ResourceConfig> = {
  customers: { table: "customers", columns: "id,project_id,name,contact,phone,email,gender,tags,status,created_at,updated_at", statusColumn: "status", searchColumns: ["name", "contact", "phone", "email", "tags"], orderBy: "updated_at DESC" },
  suppliers: { table: "suppliers", columns: "id,project_id,name,contact,phone,email,tags,created_at,updated_at", searchColumns: ["name", "contact", "phone", "email", "tags"], orderBy: "updated_at DESC" },
  products: { table: "products", columns: "id,project_id,name,sku,category,unit_price,unit,updated_at", searchColumns: ["name", "sku", "category"], orderBy: "updated_at DESC" },
  orders: { table: "orders", columns: "id,project_id,customer_id,status,total_amount,notes,created_at,updated_at", statusColumn: "status", searchColumns: ["id", "notes"], orderBy: "updated_at DESC" },
  payments: { table: "payments", columns: "id,project_id,order_id,amount,method,status,received_at,created_at", statusColumn: "status", searchColumns: ["id", "order_id"], orderBy: "created_at DESC" },
  invoices: { table: "invoices", columns: "id,project_id,order_id,customer_id,invoice_number,amount,total_amount,status,due_date,issued_at,buyer_name,seller_name,created_at", statusColumn: "status", searchColumns: ["id", "invoice_number", "buyer_name", "seller_name"], orderBy: "created_at DESC" },
  tasks: { table: "tasks", columns: "id,project_id,assignee_id,title,description,status,priority,due_date,source_type,source_id,created_at,updated_at", statusColumn: "status", searchColumns: ["title", "description"], orderBy: "created_at DESC" },
  files: { table: "files", columns: "id,project_id,filename,mime_type,size,uploaded_by,created_at", searchColumns: ["filename", "mime_type"], orderBy: "created_at DESC" },
};

function boundedLimit(value: unknown): number {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.trunc(parsed))) : 20;
}

function withParsedTags(row: unknown): unknown {
  if (!row || typeof row !== "object" || !("tags" in row)) return row;
  const record = row as Record<string, unknown>;
  if (typeof record.tags !== "string") return row;
  try {
    return { ...record, tags: JSON.parse(record.tags) as unknown };
  } catch {
    return { ...record, tags: [] };
  }
}

function dashboard(enterpriseId: string, projectId?: string) {
  const db = getDb();
  const projectClause = projectId ? "AND project_id = ?" : "";
  const scopeParams = projectId ? [enterpriseId, projectId] : [enterpriseId];
  const count = (table: string, extra = "", params: unknown[] = []) =>
    (db.prepare(`SELECT COUNT(*) AS value FROM ${table} WHERE enterprise_id = ? ${projectClause} ${extra}`).get(...scopeParams, ...params) as { value: number }).value;
  const paid = db.prepare(`SELECT COALESCE(SUM(amount),0) AS value FROM payments WHERE enterprise_id = ? ${projectClause} AND status = 'completed'`).get(...scopeParams) as { value: number };
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

function customerValueRanking(enterpriseId: string, limit: number, projectId?: string) {
  const db = getDb();
  const projectClause = projectId ? "AND project_id = ?" : "";
  const scopeParams = projectId ? [enterpriseId, projectId] : [enterpriseId];
  const rows = db.prepare(
    `WITH order_metrics AS (
       SELECT customer_id,
              COUNT(*) AS order_count,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_amount ELSE 0 END), 0) AS order_amount,
              MAX(created_at) AS last_order_at
       FROM orders
       WHERE enterprise_id = ? ${projectClause} AND customer_id IS NOT NULL
       GROUP BY customer_id
     ),
     payment_metrics AS (
       SELECT o.customer_id,
              COUNT(p.id) AS completed_payment_count,
              COALESCE(SUM(p.amount), 0) AS completed_payment_amount
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.enterprise_id = ? ${projectId ? "AND p.project_id = ?" : ""} AND p.status = 'completed' AND o.customer_id IS NOT NULL
       GROUP BY o.customer_id
     ),
     invoice_metrics AS (
       SELECT customer_id,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(CASE WHEN status IN ('issued','overdue') THEN COALESCE(total_amount, amount) ELSE 0 END), 0) AS outstanding_invoice_amount
       FROM invoices
       WHERE enterprise_id = ? ${projectClause} AND customer_id IS NOT NULL
       GROUP BY customer_id
     )
     SELECT c.id,
            c.name,
            c.contact,
            c.phone,
            c.email,
            c.gender,
            c.tags,
            c.status,
            COALESCE(om.order_count, 0) AS order_count,
            COALESCE(om.order_amount, 0) AS order_amount,
            COALESCE(pm.completed_payment_count, 0) AS completed_payment_count,
            COALESCE(pm.completed_payment_amount, 0) AS completed_payment_amount,
            COALESCE(im.invoice_count, 0) AS invoice_count,
            COALESCE(im.outstanding_invoice_amount, 0) AS outstanding_invoice_amount,
            om.last_order_at
     FROM customers c
     LEFT JOIN order_metrics om ON om.customer_id = c.id
     LEFT JOIN payment_metrics pm ON pm.customer_id = c.id
     LEFT JOIN invoice_metrics im ON im.customer_id = c.id
     WHERE c.enterprise_id = ? ${projectId ? "AND c.project_id = ?" : ""}
     ORDER BY completed_payment_amount DESC,
              order_amount DESC,
              order_count DESC,
              COALESCE(last_order_at, c.updated_at) DESC
     LIMIT ?`,
  ).all(...scopeParams, ...scopeParams, ...scopeParams, ...scopeParams, limit);
  const summary = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM customers WHERE enterprise_id = ? ${projectClause}) AS scanned_customers,
       (SELECT COUNT(DISTINCT customer_id) FROM orders WHERE enterprise_id = ? ${projectClause} AND customer_id IS NOT NULL) AS customers_with_orders,
       (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE enterprise_id = ? ${projectClause} AND status NOT IN ('cancelled','refunded')) AS order_amount,
       (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE enterprise_id = ? ${projectClause} AND status = 'completed') AS completed_payment_amount,
       (SELECT COALESCE(SUM(COALESCE(total_amount, amount)), 0) FROM invoices WHERE enterprise_id = ? ${projectClause} AND status IN ('issued','overdue')) AS outstanding_invoice_amount`,
  ).get(...scopeParams, ...scopeParams, ...scopeParams, ...scopeParams, ...scopeParams) as Record<string, number>;

  return {
    ok: true,
    resource: "customer_value",
    summary: {
      scannedCustomers: summary.scanned_customers,
      customersWithOrders: summary.customers_with_orders,
      orderAmount: summary.order_amount,
      completedPaymentAmount: summary.completed_payment_amount,
      outstandingInvoiceAmount: summary.outstanding_invoice_amount,
      completeScan: true,
      projectId: projectId ?? null,
    },
    rankingBasis: ["completed_payment_amount", "order_amount", "order_count", "last_order_at"],
    returned: rows.length,
    items: rows.map(withParsedTags),
  };
}

export async function businessQueryExecute(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = typeof input._enterpriseId === "string" ? input._enterpriseId : "";
  const resource = typeof input.resource === "string" ? input.resource.trim().toLowerCase() : "dashboard";
  if (!enterpriseId) throw new Error("缺少当前企业上下文");
  const requestedProjectId = typeof input._projectId === "string" && input._projectId ? input._projectId : undefined;
  // A business subcategory must always be owned by the selected enterprise.
  const projectId = requestedProjectId ? resolveProjectId(enterpriseId, requestedProjectId) : undefined;

  if (resource === "dashboard") {
    return JSON.stringify({ ok: true, resource, summary: dashboard(enterpriseId, projectId) });
  }

  if (resource === "customer_duplicates") {
    return JSON.stringify({
      ok: true,
      resource,
      ...customerDuplicateReport(enterpriseId, boundedLimit(input.limit), projectId),
    });
  }

  if (resource === "customer_value") {
    return JSON.stringify(customerValueRanking(enterpriseId, boundedLimit(input.limit), projectId));
  }

  if (resource === "automations") {
    const projectClause = projectId ? "AND a.project_id=?" : "";
    const scopeParams = projectId ? [enterpriseId, projectId] : [enterpriseId];
    const total = (getDb().prepare(
      `SELECT COUNT(*) AS value FROM automations a JOIN projects p ON p.id=a.project_id WHERE p.enterprise_id=? ${projectClause}`,
    ).get(...scopeParams) as { value: number }).value;
    const rows = getDb().prepare(
      `SELECT a.id,a.name,a.trigger_type,a.trigger_desc,a.action_type,a.action_desc,a.enabled,a.run_count,a.last_run,a.last_status,a.last_error
       FROM automations a JOIN projects p ON p.id=a.project_id
       WHERE p.enterprise_id=? ${projectClause} ORDER BY a.enabled DESC,a.name LIMIT ?`,
    ).all(...scopeParams, boundedLimit(input.limit));
    return JSON.stringify({ ok: true, resource, total, returned: rows.length, items: rows });
  }

  if (resource === "library") {
    const projectClause = projectId ? "AND project_id=?" : "";
    const scopeParams = projectId ? [enterpriseId, projectId] : [enterpriseId];
    const total = (getDb().prepare(`SELECT COUNT(*) AS value FROM library_items WHERE enterprise_id=? ${projectClause}`).get(...scopeParams) as { value: number }).value;
    const rows = getDb().prepare(
      `SELECT id,project_id,name,type,summary,visibility,created_at FROM library_items WHERE enterprise_id=? ${projectClause} ORDER BY created_at DESC LIMIT ?`,
    ).all(...scopeParams, boundedLimit(input.limit));
    return JSON.stringify({ ok: true, resource, total, returned: rows.length, items: rows });
  }

  const config = RESOURCES[resource];
  if (!config) throw new Error(`不支持的业务资源：${resource}`);
  const where = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (projectId) {
    where.push("project_id = ?");
    params.push(projectId);
  }
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
  const items = resource === "customers" || resource === "suppliers" ? rows.map(withParsedTags) : rows;
  const result: Record<string, unknown> = { ok: true, resource, total, returned: rows.length, items };
  if (resource === "customers") {
    result.duplicateAnalysis = customerDuplicateReport(enterpriseId, 0, projectId).summary;
  }
  return JSON.stringify(result);
}

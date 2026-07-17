import type { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";
import { canAccessEnterprise } from "./auth-context.js";

function scalar(sql: string, enterpriseId: string): number {
  return (getDb().prepare(sql).get(enterpriseId) as { value: number }).value;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard", async (request, reply) => {
    const { enterpriseId } = request.query as { enterpriseId?: string };
    if (!enterpriseId) return reply.status(400).send({ error: "缺少 enterpriseId" });
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;

    const orderStatusRows = getDb().prepare(
      "SELECT status, COUNT(*) AS count FROM orders WHERE enterprise_id = ? GROUP BY status",
    ).all(enterpriseId) as Array<{ status: string; count: number }>;

    return {
      revenueTotal: scalar(
        "SELECT COALESCE(SUM(amount),0) AS value FROM payments WHERE enterprise_id = ? AND status = 'completed'",
        enterpriseId,
      ),
      monthRevenue: scalar(
        `SELECT COALESCE(SUM(amount),0) AS value FROM payments
         WHERE enterprise_id = ? AND status = 'completed'
           AND strftime('%Y-%m', COALESCE(received_at, created_at)) = strftime('%Y-%m', 'now', 'localtime')`,
        enterpriseId,
      ),
      orderTotal: scalar("SELECT COUNT(*) AS value FROM orders WHERE enterprise_id = ?", enterpriseId),
      pendingOrderCount: scalar(
        "SELECT COUNT(*) AS value FROM orders WHERE enterprise_id = ? AND status IN ('confirmed','processing')",
        enterpriseId,
      ),
      deliveredOrderCount: scalar(
        "SELECT COUNT(*) AS value FROM orders WHERE enterprise_id = ? AND status = 'delivered'",
        enterpriseId,
      ),
      orderStatusCounts: Object.fromEntries(orderStatusRows.map((row) => [row.status, row.count])),
      invoiceTotal: scalar("SELECT COUNT(*) AS value FROM invoices WHERE enterprise_id = ?", enterpriseId),
      pendingInvoiceCount: scalar(
        "SELECT COUNT(*) AS value FROM invoices WHERE enterprise_id = ? AND status IN ('draft','issued','overdue')",
        enterpriseId,
      ),
      overdueInvoiceCount: scalar(
        `SELECT COUNT(*) AS value FROM invoices WHERE enterprise_id = ?
         AND (status = 'overdue' OR (due_date < date('now','localtime') AND status NOT IN ('paid','cancelled')))`,
        enterpriseId,
      ),
      customers: scalar("SELECT COUNT(*) AS value FROM customers WHERE enterprise_id = ?", enterpriseId),
      suppliers: scalar("SELECT COUNT(*) AS value FROM suppliers WHERE enterprise_id = ?", enterpriseId),
      products: scalar("SELECT COUNT(*) AS value FROM products WHERE enterprise_id = ?", enterpriseId),
      openTasks: scalar(
        "SELECT COUNT(*) AS value FROM tasks WHERE enterprise_id = ? AND status IN ('pending','in_progress')",
        enterpriseId,
      ),
    };
  });
}

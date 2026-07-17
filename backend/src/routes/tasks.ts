import type { FastifyInstance } from "fastify";
import { UpdateTaskRequestSchema, type Task } from "shared";
import { getDb } from "../db/index.js";
import { canAccessEnterprise } from "./auth-context.js";

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    enterpriseId: row.enterprise_id as string,
    assigneeId: (row.assignee_id as string) || null,
    title: row.title as string,
    description: (row.description as string) || "",
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    dueDate: (row.due_date as string) || null,
    sourceType: (row.source_type as string) || null,
    sourceId: (row.source_id as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tasks", async (request, reply) => {
    const { enterpriseId, status, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return reply.status(400).send({ error: "缺少 enterpriseId" });
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    const conditions = ["enterprise_id = ?"];
    const params: unknown[] = [enterpriseId];
    if (status === "open") {
      conditions.push("status IN ('pending','in_progress')");
    } else if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    const pageNumber = Math.max(1, Number(page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(limit ?? 20)));
    const where = conditions.join(" AND ");
    const total = (getDb().prepare(`SELECT COUNT(*) AS count FROM tasks WHERE ${where}`).get(...params) as { count: number }).count;
    const rows = getDb().prepare(
      `SELECT * FROM tasks WHERE ${where}
       ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at DESC
       LIMIT ? OFFSET ?`,
    ).all(...params, pageSize, (pageNumber - 1) * pageSize) as Record<string, unknown>[];
    return { items: rows.map(rowToTask), total, page: pageNumber, limit: pageSize };
  });

  app.patch("/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return reply.status(404).send({ error: "待办不存在" });
    if (!canAccessEnterprise(request, row.enterprise_id as string, reply)) return;
    const parsed = UpdateTaskRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const current = rowToTask(row);
    getDb().prepare(
      "UPDATE tasks SET status=?,priority=?,assignee_id=?,due_date=?,updated_at=? WHERE id=?",
    ).run(
      parsed.data.status ?? current.status,
      parsed.data.priority ?? current.priority,
      parsed.data.assigneeId !== undefined ? parsed.data.assigneeId : current.assigneeId,
      parsed.data.dueDate !== undefined ? parsed.data.dueDate : current.dueDate,
      new Date().toISOString(),
      id,
    );
    return rowToTask(getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown>);
  });
}

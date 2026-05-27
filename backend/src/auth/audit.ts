import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

function db() { return getDb(); }

export interface AuditEntry {
  enterpriseId: string;
  userId?: string;
  action: string;
  objectType: string;
  objectId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
}

export function createAuditLog(entry: AuditEntry): void {
  db()
    .prepare("INSERT INTO audit_logs (id, enterprise_id, user_id, action, object_type, object_id, changes, ip_address, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(
      `audit-${randomUUID()}`,
      entry.enterpriseId,
      entry.userId ?? null,
      entry.action,
      entry.objectType,
      entry.objectId ?? null,
      JSON.stringify(entry.changes ?? {}),
      entry.ipAddress ?? "",
      new Date().toISOString(),
    );
}

export function listAuditLogs(
  enterpriseId: string,
  opts?: { objectType?: string; objectId?: string; page?: number; limit?: number },
): { items: Array<Record<string, unknown>>; total: number } {
  const conds: string[] = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.objectType) { conds.push("object_type = ?"); params.push(opts.objectType); }
  if (opts?.objectId) { conds.push("object_id = ?"); params.push(opts.objectId); }
  const where = conds.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM audit_logs WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const rows = db()
    .prepare(`SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows, total };
}

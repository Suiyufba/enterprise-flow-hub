import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

function db() { return getDb(); }

export interface StatusTransition {
  from: string[];
  to: string[];
}

export const STATUS_FLOWS: Record<string, StatusTransition[]> = {
  order: [
    { from: ["draft"], to: ["confirmed", "cancelled"] },
    { from: ["confirmed"], to: ["processing", "cancelled"] },
    { from: ["processing"], to: ["shipped", "cancelled"] },
    { from: ["shipped"], to: ["delivered", "cancelled"] },
    { from: ["delivered"], to: ["refunded"] },
    { from: ["cancelled"], to: [] },
    { from: ["refunded"], to: [] },
  ],
  customer: [
    { from: ["lead"], to: ["active", "lost"] },
    { from: ["active"], to: ["inactive", "lost"] },
    { from: ["inactive"], to: ["active", "lost"] },
    { from: ["lost"], to: [] },
  ],
  payment: [
    { from: ["pending"], to: ["completed", "failed"] },
    { from: ["completed"], to: ["refunded"] },
    { from: ["failed"], to: ["pending", "completed"] },
    { from: ["refunded"], to: [] },
  ],
  invoice: [
    { from: ["draft"], to: ["issued", "cancelled"] },
    { from: ["issued"], to: ["paid", "overdue", "cancelled"] },
    { from: ["paid"], to: [] },
    { from: ["overdue"], to: ["paid", "cancelled"] },
    { from: ["cancelled"], to: [] },
  ],
  task: [
    { from: ["pending"], to: ["in_progress", "cancelled"] },
    { from: ["in_progress"], to: ["completed", "cancelled"] },
    { from: ["completed"], to: [] },
    { from: ["cancelled"], to: [] },
  ],
  approval: [
    { from: ["pending"], to: ["approved", "rejected", "cancelled"] },
    { from: ["approved"], to: [] },
    { from: ["rejected"], to: [] },
    { from: ["cancelled"], to: [] },
  ],
};

export interface BusinessObjectStatus {
  id: string;
  objectType: string;
  objectId: string;
  status: string;
  previousStatus: string | null;
  changedBy: string | null;
  changedAt: string;
  comment: string;
}

export function isValidTransition(objectType: string, from: string, to: string): boolean {
  const flows = STATUS_FLOWS[objectType];
  if (!flows) return false;
  return flows.some((f) => f.from.includes(from) && f.to.includes(to));
}

export function transitionStatus(
  objectType: string,
  objectId: string,
  toStatus: string,
  changedBy?: string,
  comment?: string,
): { ok: boolean; error?: string; status?: BusinessObjectStatus } {
  const current = getCurrentStatus(objectType, objectId);
  if (current && !isValidTransition(objectType, current, toStatus)) {
    return { ok: false, error: `不能将 ${objectType} 从 ${current} 转为 ${toStatus}` };
  }
  const entry: BusinessObjectStatus = {
    id: `bos-${randomUUID()}`,
    objectType,
    objectId,
    status: toStatus,
    previousStatus: current ?? null,
    changedBy: changedBy ?? null,
    changedAt: new Date().toISOString(),
    comment: comment ?? "",
  };
  db()
    .prepare("INSERT INTO business_object_statuses (id, object_type, object_id, status, previous_status, changed_by, changed_at, comment) VALUES (?,?,?,?,?,?,?,?)")
    .run(entry.id, entry.objectType, entry.objectId, entry.status, entry.previousStatus, entry.changedBy, entry.changedAt, entry.comment);
  return { ok: true, status: entry };
}

export function getCurrentStatus(objectType: string, objectId: string): string | undefined {
  const row = db()
    .prepare("SELECT status FROM business_object_statuses WHERE object_type = ? AND object_id = ? ORDER BY changed_at DESC LIMIT 1")
    .get(objectType, objectId) as Record<string, unknown> | undefined;
  return row?.status as string | undefined;
}

export function getStatusHistory(objectType: string, objectId: string): BusinessObjectStatus[] {
  return (db()
    .prepare("SELECT * FROM business_object_statuses WHERE object_type = ? AND object_id = ? ORDER BY changed_at DESC")
    .all(objectType, objectId) as Record<string, unknown>[])
    .map((r) => ({
      id: r.id as string,
      objectType: r.object_type as string,
      objectId: r.object_id as string,
      status: r.status as string,
      previousStatus: (r.previous_status as string) || null,
      changedBy: (r.changed_by as string) || null,
      changedAt: r.changed_at as string,
      comment: (r.comment as string) || "",
    }));
}

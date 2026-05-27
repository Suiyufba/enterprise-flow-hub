import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync, unlinkSync } from "node:fs";
import { getDb } from "../db/index.js";
import type { FileRecord, PaginatedList } from "shared";

function db() { return getDb(); }

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

function ensureUploadDir(enterpriseId: string): string {
  const dir = join(UPLOAD_DIR, enterpriseId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function rowToFile(r: Record<string, unknown>): FileRecord {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    filename: r.filename as string,
    mimeType: r.mime_type as string,
    size: r.size as number,
    storagePath: "", // never expose internal path to clients
    uploadedBy: (r.uploaded_by as string) || null,
    relatedType: (r.related_type as string) || null,
    relatedId: (r.related_id as string) || null,
    createdAt: r.created_at as string,
  };
}

export function listFiles(
  enterpriseId: string,
  opts?: { relatedType?: string; relatedId?: string; page?: number; limit?: number },
): PaginatedList<FileRecord> {
  const conds: string[] = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.relatedType && opts?.relatedId) {
    conds.push("related_type = ? AND related_id = ?");
    params.push(opts.relatedType, opts.relatedId);
  }
  const where = conds.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM files WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const rows = db()
    .prepare(`SELECT * FROM files WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows.map(rowToFile), total, page, limit };
}

export function getFile(id: string): FileRecord | undefined {
  const row = db().prepare("SELECT * FROM files WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToFile(row) : undefined;
}

// Internal: returns full record including storage path (for download/OCR)
export function getFileInternal(id: string): (FileRecord & { storagePath: string }) | undefined {
  const row = db().prepare("SELECT * FROM files WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    ...rowToFile(row),
    storagePath: row.storage_path as string,
  };
}

export function createFile(record: {
  enterpriseId: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedBy?: string;
  relatedType?: string;
  relatedId?: string;
}): FileRecord {
  const now = new Date().toISOString();
  const file: FileRecord = {
    id: `file-${randomUUID()}`,
    enterpriseId: record.enterpriseId,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    storagePath: record.storagePath,
    uploadedBy: record.uploadedBy ?? null,
    relatedType: record.relatedType ?? null,
    relatedId: record.relatedId ?? null,
    createdAt: now,
  };
  db()
    .prepare("INSERT INTO files (id, enterprise_id, filename, mime_type, size, storage_path, uploaded_by, related_type, related_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(file.id, file.enterpriseId, file.filename, file.mimeType, file.size, file.storagePath, file.uploadedBy, file.relatedType, file.relatedId, file.createdAt);
  return file;
}

export function deleteFile(id: string): boolean {
  const file = getFileInternal(id);
  if (!file) return false;
  try { unlinkSync(file.storagePath); } catch { /* file may already be gone */ }
  return db().prepare("DELETE FROM files WHERE id = ?").run(id).changes > 0;
}

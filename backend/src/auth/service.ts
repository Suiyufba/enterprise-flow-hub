import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { getUser } from "../store.js";
import type { User } from "shared";

function db() { return getDb(); }

export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(48).toString("hex");
  const sessionId = `sess-${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
  db()
    .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?,?,?,?,?)")
    .run(sessionId, userId, token, expiresAt.toISOString(), now.toISOString());
  // Clean expired
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now.toISOString());
  return { token, expiresAt: expiresAt.toISOString() };
}

export function validateSession(token: string): User | null {
  const row = db()
    .prepare("SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?")
    .get(token, new Date().toISOString()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return getUser(row.user_id as string) ?? null;
}

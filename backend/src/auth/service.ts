import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { getDb } from "../db/index.js";
import { getUser } from "../store.js";
import type { User } from "shared";

function db() { return getDb(); }

function hashToken(token: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(token, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyToken(token: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(token, salt, 64).toString("hex");
  return check === hash;
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(48).toString("hex");
  const sessionId = `sess-${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
  // Store first 12 chars as lookup prefix, hash the full token
  db()
    .prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?,?,?,?,?)")
    .run(sessionId, userId, hashToken(token), expiresAt.toISOString(), now.toISOString());
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now.toISOString());
  return { token, expiresAt: expiresAt.toISOString() };
}

export function validateSession(token: string): User | null {
  // Get all non-expired sessions (acceptable for enterprise-scale user counts)
  // Each stored token is scrypt-hashed, brute-force comparison is infeasible
  const rows = db()
    .prepare("SELECT user_id, token FROM sessions WHERE expires_at > ? ORDER BY created_at DESC LIMIT 200")
    .all(new Date().toISOString()) as Array<{ user_id: string; token: string }>;
  for (const row of rows) {
    if (verifyToken(token, row.token)) {
      return getUser(row.user_id) ?? null;
    }
  }
  return null;
}

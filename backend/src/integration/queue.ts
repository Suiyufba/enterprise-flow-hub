import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

function db() { return getDb(); }

interface IntegrationRun {
  id: string;
  integrationType: string;
  objectType: string | null;
  objectId: string | null;
  status: string;
  requestPayload: Record<string, unknown>;
  errorMessage: string;
  retryCount: number;
  maxRetries: number;
  idempotencyKey: string | null;
}

type IntegrationRow = {
  id: string;
  integration_type: string;
  request_payload: string;
  retry_count: number;
  max_retries: number;
};

const executors = new Map<string, (payload: Record<string, unknown>) => Promise<{ ok: boolean; response?: string; error?: string }>>();
const workerId = `${hostname()}:${process.pid}:integration:${randomUUID()}`;
const leaseMs = Math.max(30_000, Number(process.env.INTEGRATION_LEASE_MS ?? 120_000));
const pollMs = Math.max(500, Number(process.env.INTEGRATION_POLL_MS ?? 5_000));
let draining = false;
let started = false;

export function registerIntegration(
  type: string,
  executor: (payload: Record<string, unknown>) => Promise<{ ok: boolean; response?: string; error?: string }>,
): void {
  executors.set(type, executor);
  kickIntegrationWorker();
}

function rowToRun(row: Record<string, unknown>): IntegrationRun {
  let requestPayload: Record<string, unknown> = {};
  try { requestPayload = JSON.parse(String(row.request_payload ?? "{}")) as Record<string, unknown>; } catch { /* keep empty */ }
  return {
    id: String(row.id),
    integrationType: String(row.integration_type),
    objectType: row.object_type ? String(row.object_type) : null,
    objectId: row.object_id ? String(row.object_id) : null,
    status: String(row.status),
    requestPayload,
    errorMessage: String(row.error_message ?? ""),
    retryCount: Number(row.retry_count ?? 0),
    maxRetries: Number(row.max_retries ?? 3),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
  };
}

export function enqueue(config: {
  integrationType: string;
  objectType?: string;
  objectId?: string;
  requestPayload: Record<string, unknown>;
  idempotencyKey?: string;
  maxRetries?: number;
}): IntegrationRun {
  if (config.idempotencyKey) {
    const existing = db().prepare("SELECT * FROM integration_runs WHERE idempotency_key = ?").get(config.idempotencyKey) as Record<string, unknown> | undefined;
    if (existing) return rowToRun(existing);
  }
  const run: IntegrationRun = {
    id: `int-${randomUUID()}`,
    integrationType: config.integrationType,
    objectType: config.objectType ?? null,
    objectId: config.objectId ?? null,
    status: "pending",
    requestPayload: config.requestPayload,
    errorMessage: "",
    retryCount: 0,
    maxRetries: config.maxRetries ?? 3,
    idempotencyKey: config.idempotencyKey ?? null,
  };
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO integration_runs
      (id,integration_type,object_type,object_id,status,request_payload,retry_count,max_retries,idempotency_key,created_at,next_retry_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(run.id, run.integrationType, run.objectType, run.objectId, run.status, JSON.stringify(run.requestPayload), run.retryCount, run.maxRetries, run.idempotencyKey, now, now);
  kickIntegrationWorker();
  return run;
}

function claimIntegrationRun(): IntegrationRow | undefined {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
  const transaction = db().transaction(() => {
    const candidate = db().prepare(`
      SELECT id FROM integration_runs
      WHERE retry_count < max_retries
        AND (
          (status='pending' AND (next_retry_at IS NULL OR next_retry_at <= ?))
          OR (status='failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?)
          OR (status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        )
      ORDER BY COALESCE(next_retry_at, created_at) ASC, created_at ASC
      LIMIT 1
    `).get(nowIso, nowIso, nowIso) as { id: string } | undefined;
    if (!candidate) return undefined;
    const updated = db().prepare(`
      UPDATE integration_runs
      SET status='running', lease_owner=?, lease_expires_at=?, heartbeat_at=?, next_retry_at=NULL
      WHERE id=? AND retry_count < max_retries
        AND (
          status IN ('pending','failed') OR (status='running' AND lease_expires_at <= ?)
        )
    `).run(workerId, leaseExpiresAt, nowIso, candidate.id, nowIso);
    if (updated.changes !== 1) return undefined;
    return db().prepare("SELECT id,integration_type,request_payload,retry_count,max_retries FROM integration_runs WHERE id=?").get(candidate.id) as IntegrationRow;
  });
  return transaction.immediate();
}

async function processRun(row: IntegrationRow): Promise<void> {
  const executor = executors.get(row.integration_type);
  if (!executor) {
    db().prepare(`
      UPDATE integration_runs
      SET status='failed', retry_count=max_retries, error_message=?, completed_at=?, lease_owner=NULL, lease_expires_at=NULL
      WHERE id=? AND lease_owner=?
    `).run(`No executor for type: ${row.integration_type}`, new Date().toISOString(), row.id, workerId);
    return;
  }
  const heartbeat = setInterval(() => {
    const now = new Date();
    db().prepare(`
      UPDATE integration_runs SET heartbeat_at=?, lease_expires_at=?
      WHERE id=? AND status='running' AND lease_owner=?
    `).run(now.toISOString(), new Date(now.getTime() + leaseMs).toISOString(), row.id, workerId);
  }, Math.max(5_000, Math.floor(leaseMs / 3)));
  heartbeat.unref();
  try {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(row.request_payload) as Record<string, unknown>; } catch { /* keep empty */ }
    const result = await executor(payload);
    if (!result.ok) throw new Error(result.error ?? "未知错误");
    db().prepare(`
      UPDATE integration_runs
      SET status='success', response_payload=?, error_message='', completed_at=?,
          lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL
      WHERE id=? AND lease_owner=?
    `).run(result.response ?? "", new Date().toISOString(), row.id, workerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nextRetryCount = row.retry_count + 1;
    const exhausted = nextRetryCount >= row.max_retries;
    const delay = Math.min(1_000 * (2 ** nextRetryCount), 3_600_000);
    db().prepare(`
      UPDATE integration_runs
      SET status='failed', retry_count=?, error_message=?, next_retry_at=?, completed_at=?,
          lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL
      WHERE id=? AND lease_owner=?
    `).run(
      nextRetryCount,
      message,
      exhausted ? null : new Date(Date.now() + delay).toISOString(),
      exhausted ? new Date().toISOString() : null,
      row.id,
      workerId,
    );
  } finally {
    clearInterval(heartbeat);
  }
}

export async function drainIntegrationRuns(limit = 25): Promise<number> {
  let processed = 0;
  while (processed < limit) {
    const row = claimIntegrationRun();
    if (!row) break;
    await processRun(row);
    processed += 1;
  }
  return processed;
}

function kickIntegrationWorker(): void {
  if (draining) return;
  draining = true;
  setImmediate(() => { void drainIntegrationRuns().finally(() => { draining = false; }); });
}

registerIntegration("webhook", async (payload) => {
  const { url, method, headers, body } = payload as Record<string, unknown>;
  const targetUrl = typeof url === "string" ? url : "";
  if (!targetUrl) return { ok: false, error: "Missing URL" };
  try {
    const parsed = new URL(targetUrl);
    if (["127.0.0.1", "localhost", "0.0.0.0", "[::1]"].includes(parsed.hostname)) return { ok: false, error: "Cannot call internal addresses" };
    if (parsed.hostname.startsWith("10.") || parsed.hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)) {
      return { ok: false, error: "Cannot call private network addresses" };
    }
  } catch { return { ok: false, error: "Invalid URL" }; }
  const res = await fetch(targetUrl, {
    method: (method as string) ?? "POST",
    headers: { "Content-Type": "application/json", ...(headers as Record<string, string> ?? {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const response = await res.text();
  return { ok: res.ok, response: response.slice(0, 10_000), error: res.ok ? undefined : response.slice(0, 500) };
});

export function startIntegrationScheduler(): void {
  if (started) return;
  started = true;
  kickIntegrationWorker();
  const timer = setInterval(kickIntegrationWorker, pollMs);
  timer.unref();
}

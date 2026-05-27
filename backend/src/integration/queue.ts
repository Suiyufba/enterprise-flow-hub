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

const executors = new Map<string, (payload: Record<string, unknown>) => Promise<{ ok: boolean; response?: string; error?: string }>>();

export function registerIntegration(
  type: string,
  executor: (payload: Record<string, unknown>) => Promise<{ ok: boolean; response?: string; error?: string }>,
): void {
  executors.set(type, executor);
}

export function enqueue(config: {
  integrationType: string;
  objectType?: string;
  objectId?: string;
  requestPayload: Record<string, unknown>;
  idempotencyKey?: string;
  maxRetries?: number;
}): IntegrationRun {
  // Check idempotency
  if (config.idempotencyKey) {
    const existing = db()
      .prepare("SELECT * FROM integration_runs WHERE idempotency_key = ?")
      .get(config.idempotencyKey) as Record<string, unknown> | undefined;
    if (existing) return existing as unknown as IntegrationRun;
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

  db()
    .prepare("INSERT INTO integration_runs (id, integration_type, object_type, object_id, status, request_payload, retry_count, max_retries, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(run.id, run.integrationType, run.objectType, run.objectId, run.status, JSON.stringify(run.requestPayload), run.retryCount, run.maxRetries, run.idempotencyKey, new Date().toISOString());

  // Fire-and-forget execution
  setImmediate(() => processRun(run.id));
  return run;
}

async function processRun(runId: string): Promise<void> {
  const row = db().prepare("SELECT * FROM integration_runs WHERE id = ? AND status = 'pending'").get(runId) as Record<string, unknown> | undefined;
  if (!row) return;

  db().prepare("UPDATE integration_runs SET status = 'running' WHERE id = ?").run(runId);
  const executor = executors.get(row.integration_type as string);
  if (!executor) {
    db().prepare("UPDATE integration_runs SET status = 'failed', error_message = ? WHERE id = ?").run(`No executor for type: ${row.integration_type}`, runId);
    return;
  }

  try {
    const result = await executor(JSON.parse(row.request_payload as string));
    if (result.ok) {
      db().prepare("UPDATE integration_runs SET status = 'success', response_payload = ?, completed_at = ? WHERE id = ?")
        .run(result.response ?? "", new Date().toISOString(), runId);
    } else {
      throw new Error(result.error ?? "未知错误");
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const retryCount = (row.retry_count as number) + 1;
    if (retryCount < (row.max_retries as number)) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 3600000);
      db().prepare("UPDATE integration_runs SET status = 'failed', retry_count = ?, error_message = ?, next_retry_at = ? WHERE id = ?")
        .run(retryCount, error, new Date(Date.now() + delay).toISOString(), runId);
    } else {
      db().prepare("UPDATE integration_runs SET status = 'failed', retry_count = ?, error_message = ?, completed_at = ? WHERE id = ?")
        .run(retryCount, error, new Date().toISOString(), runId);
    }
  }
}

// Register default webhook executor with SSRF protection
registerIntegration("webhook", async (payload) => {
  const { url, method, headers, body } = payload as Record<string, unknown>;
  const targetUrl = typeof url === "string" ? url : "";
  if (!targetUrl) return { ok: false, error: "Missing URL" };

  // Block internal/private IP ranges
  try {
    const parsed = new URL(targetUrl);
    if (["127.0.0.1", "localhost", "0.0.0.0", "[::1]"].includes(parsed.hostname)) {
      return { ok: false, error: "Cannot call internal addresses" };
    }
    if (parsed.hostname.startsWith("10.") || parsed.hostname.startsWith("192.168.") || parsed.hostname.startsWith("172.16.")) {
      return { ok: false, error: "Cannot call private network addresses" };
    }
  } catch { return { ok: false, error: "Invalid URL" }; }

  const res = await fetch(targetUrl, {
    method: (method as string) ?? "POST",
    headers: { "Content-Type": "application/json", ...(headers as Record<string, string> ?? {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const response = await res.text();
  return { ok: res.ok, response: response.slice(0, 10000), error: res.ok ? undefined : response.slice(0, 500) };
});

// Scheduler for pending retries
export function startIntegrationScheduler(): void {
  setInterval(() => {
    const due = db()
      .prepare("SELECT * FROM integration_runs WHERE status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?")
      .all(new Date().toISOString()) as Record<string, unknown>[];
    for (const row of due) {
      db().prepare("UPDATE integration_runs SET status = 'pending' WHERE id = ?").run(row.id);
      setImmediate(() => processRun(row.id as string));
    }
  }, 30000).unref();
}

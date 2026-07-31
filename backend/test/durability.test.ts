import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

const testDir = mkdtempSync(join(tmpdir(), "efh-durability-"));
process.env.DB_PATH = join(testDir, "efh.db");

const dbModule = await import("../src/db/index.js");
const store = await import("../src/store.js");
const scheduler = await import("../src/automation/scheduler.js");
const { drainBusinessEvents, emitEvent, onEvent } = await import("../src/events/emitter.js");
const { registerTool } = await import("../src/tools/registry.js");

const db = dbModule.getDb();
after(() => dbModule.closeDb());

// Deterministic fake tools: no network, no model accounts.
const toolBehavior = { fail: false };
registerTool("tool-durable-fixture", async () => {
  if (toolBehavior.fail) return { ok: false, error: "fixture failure" };
  return { status: "success", output: "fixture ok" };
});

before(() => {
  db.prepare(`
    INSERT OR REPLACE INTO ai_tools (id, name, description, kind, status, risk, input_schema, example_prompt, created_at)
    VALUES ('tool-durable-fixture', '持久化测试工具', '测试租约/重试语义', 'cli', 'enabled', 'write', '{}', '', ?)
  `).run(new Date().toISOString());
});

function createAutomation(actionToolId: string) {
  const automation = store.createAutomation({
    projectId: "proj-qihang-growth",
    name: `持久化测试-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trigger: "手动",
    triggerType: "manual",
    action: "执行测试工具",
    actionType: "tool_call",
    actionToolId,
  });
  assert.ok(automation);
  return automation;
}

test("automation lease blocks a second worker and is taken over after expiry", () => {
  const automation = createAutomation("tool-durable-fixture");
  const now = new Date();

  // First worker acquires the lease.
  assert.equal(scheduler.acquireAutomationLease(automation.id, "worker-a"), true);

  // A second worker cannot acquire while the lease is valid.
  assert.equal(scheduler.acquireAutomationLease(automation.id, "worker-b"), false);

  // The same owner may re-acquire (idempotent heartbeat semantics).
  assert.equal(scheduler.acquireAutomationLease(automation.id, "worker-a"), true);

  // After the lease expires, an arbitrary worker can take over (crash recovery).
  db.prepare("UPDATE automation_leases SET lease_expires_at=? WHERE automation_id=?")
    .run(new Date(now.getTime() - 1_000).toISOString(), automation.id);
  assert.equal(scheduler.acquireAutomationLease(automation.id, "worker-b"), true);
  assert.equal(
    (db.prepare("SELECT owner_id FROM automation_leases WHERE automation_id=?").get(automation.id) as { owner_id: string }).owner_id,
    "worker-b",
  );
});

test("scheduled jobs are deduplicated per time slot", async () => {
  const automation = store.createAutomation({
    projectId: "proj-qihang-growth",
    name: `调度去重-${Date.now()}`,
    trigger: "每天9:00",
    triggerType: "schedule",
    action: "执行测试工具",
    actionType: "tool_call",
    actionToolId: "tool-durable-fixture",
  });
  assert.ok(automation);
  const now = new Date("2026-07-31T01:00:00.000Z");

  assert.equal(scheduler.enqueueScheduledAutomation(automation, now, "Asia/Shanghai"), true);
  // Same scan window: the pending job already exists, so nothing is enqueued.
  assert.equal(scheduler.enqueueScheduledAutomation(automation, now, "Asia/Shanghai"), false);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM automation_jobs WHERE automation_id=?").get(automation.id) as { n: number }).n,
    1,
  );

  // The one-active-job guard also blocks while the job is still pending.
  const nextDay = new Date("2026-08-01T01:00:00.000Z");
  assert.equal(scheduler.enqueueScheduledAutomation(automation, nextDay, "Asia/Shanghai"), false);

  // Once the first job completes, a different day is a different slot.
  assert.equal(await scheduler.drainAutomationJobs(undefined, 1), 1);
  assert.equal(
    (db.prepare("SELECT status FROM automation_jobs WHERE automation_id=? AND dedupe_key=?").get(automation.id, `schedule:${automation.id}:2026-07-31`) as { status: string }).status,
    "success",
  );
  assert.equal(scheduler.enqueueScheduledAutomation(automation, nextDay, "Asia/Shanghai"), true);
});

test("failing scheduled jobs retry with backoff and go dead after max attempts", async () => {
  // Keep any jobs left over from other tests out of this test's claim window.
  db.prepare("UPDATE automation_jobs SET available_at=? WHERE status IN ('pending','failed') AND id <> 'ajob-dead-test'")
    .run("2099-01-01T00:00:00.000Z");
  toolBehavior.fail = true;
  const automation = createAutomation("tool-durable-fixture");
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO automation_jobs
      (id, automation_id, trigger_source, trigger_event, dedupe_key, status, attempts, max_attempts, available_at, created_at, updated_at)
    VALUES ('ajob-dead-test', ?, 'schedule', '{}', ?, 'pending', 0, 2, ?, ?, ?)
  `).run(automation.id, `dead:${automation.id}`, new Date(Date.now() - 1_000).toISOString(), now, now);

  // Attempt 1: fails, becomes retryable with backoff.
  assert.equal(await scheduler.drainAutomationJobs(undefined, 1), 1);
  let job = db.prepare("SELECT status, attempts, available_at, error_message FROM automation_jobs WHERE id='ajob-dead-test'").get() as {
    status: string; attempts: number; available_at: string; error_message: string;
  };
  assert.equal(job.status, "failed");
  assert.equal(job.attempts, 1);
  assert.match(job.error_message, /fixture failure/);
  assert.ok(new Date(job.available_at).getTime() > Date.now() - 1_000, "backoff should push available_at into the future");

  // Simulate the backoff window elapsing, then attempt 2: dead.
  db.prepare("UPDATE automation_jobs SET available_at=? WHERE id='ajob-dead-test'").run(new Date(Date.now() - 1_000).toISOString());
  assert.equal(await scheduler.drainAutomationJobs(undefined, 1), 1);
  job = db.prepare("SELECT status, attempts, error_message FROM automation_jobs WHERE id='ajob-dead-test'").get() as {
    status: string; attempts: number; error_message: string;
  };
  assert.equal(job.status, "dead");
  assert.equal(job.attempts, 2);

  // Dead jobs are never claimed again.
  assert.equal(await scheduler.drainAutomationJobs(undefined, 1), 0);
  toolBehavior.fail = false;
});

test("event deliveries stop after max attempts and mark the event dead", async () => {
  const eventType = `always-fails-${Date.now()}`;
  let calls = 0;
  onEvent(eventType, () => {
    calls += 1;
    throw new Error("persistent handler failure");
  }, `${eventType}:flaky`);
  await new Promise<void>((resolve) => setImmediate(resolve));

  const event = emitEvent(eventType, "customer", `cust-${Date.now()}`, { enterpriseId: "ent-qihang" }, "test");
  const forceAvailable = () => {
    db.prepare("UPDATE business_event_deliveries SET available_at=? WHERE event_id=? AND status='failed'")
      .run(new Date(Date.now() - 1_000).toISOString(), event.id);
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal(await drainBusinessEvents(undefined, 10), 1, `delivery attempt ${attempt} should be processed`);
    forceAvailable();
  }
  assert.equal(calls, 5, "handler must not run again after the delivery is dead");

  const delivery = db.prepare("SELECT status, attempts FROM business_event_deliveries WHERE event_id=?").get(event.id) as {
    status: string; attempts: number;
  };
  assert.equal(delivery.status, "dead");
  assert.equal(delivery.attempts, 5);
  const stored = db.prepare("SELECT processed, dispatch_status FROM business_events WHERE id=?").get(event.id) as {
    processed: number; dispatch_status: string;
  };
  assert.equal(stored.processed, 0);
  assert.equal(stored.dispatch_status, "dead");

  // Nothing is left to drain afterwards.
  assert.equal(await drainBusinessEvents(undefined, 10), 0);
});

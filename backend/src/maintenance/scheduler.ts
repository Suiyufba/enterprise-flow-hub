import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

type Logger = {
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
};
type MaintenanceTask = { name: string; hour: number; minute: number; run: () => Promise<void> };
type ClaimedRun = { task_name: string; schedule_slot: string; attempts: number; max_attempts: number };

const tasks = new Map<string, MaintenanceTask>();
const workerId = `${hostname()}:${process.pid}:maintenance:${randomUUID()}`;
const timeZone = process.env.MAINTENANCE_TIMEZONE || process.env.TZ || "Asia/Shanghai";
const pollMs = Math.max(1_000, Number(process.env.MAINTENANCE_POLL_MS ?? 60_000));
const leaseMs = Math.max(30_000, Number(process.env.MAINTENANCE_LEASE_MS ?? 30 * 60_000));
let started = false;
let draining = false;

function db() { return getDb(); }

function zonedSlot(now: Date): { dateKey: string; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    minuteOfDay: (hour === 24 ? 0 : hour) * 60 + Number(value("minute")),
  };
}

export function registerDailyMaintenanceTask(task: MaintenanceTask): void {
  tasks.set(task.name, task);
}

function enqueueDueTasks(): void {
  const now = new Date();
  const nowIso = now.toISOString();
  const zoned = zonedSlot(now);
  const insert = db().prepare(`
    INSERT OR IGNORE INTO maintenance_runs
      (task_name,schedule_slot,status,attempts,max_attempts,available_at,created_at,updated_at)
    VALUES (?,?,'pending',0,3,?,?,?)
  `);
  const transaction = db().transaction(() => {
    for (const task of tasks.values()) {
      if (zoned.minuteOfDay < task.hour * 60 + task.minute) continue;
      insert.run(task.name, zoned.dateKey, nowIso, nowIso, nowIso);
    }
  });
  transaction.immediate();
}

function claimRun(): ClaimedRun | undefined {
  const now = new Date();
  const nowIso = now.toISOString();
  const expires = new Date(now.getTime() + leaseMs).toISOString();
  const registered = Array.from(tasks.keys());
  if (registered.length === 0) return undefined;
  const placeholders = registered.map(() => "?").join(",");
  const transaction = db().transaction(() => {
    const row = db().prepare(`
      SELECT task_name,schedule_slot FROM maintenance_runs
      WHERE task_name IN (${placeholders}) AND status NOT IN ('success','dead') AND available_at <= ?
        AND (status IN ('pending','failed') OR (status='running' AND lease_expires_at <= ?))
      ORDER BY available_at ASC LIMIT 1
    `).get(...registered, nowIso, nowIso) as { task_name: string; schedule_slot: string } | undefined;
    if (!row) return undefined;
    const updated = db().prepare(`
      UPDATE maintenance_runs
      SET status='running',attempts=attempts+1,lease_owner=?,lease_expires_at=?,updated_at=?
      WHERE task_name=? AND schedule_slot=? AND status NOT IN ('success','dead')
        AND (status IN ('pending','failed') OR (status='running' AND lease_expires_at <= ?))
    `).run(workerId, expires, nowIso, row.task_name, row.schedule_slot, nowIso);
    if (updated.changes !== 1) return undefined;
    return db().prepare("SELECT task_name,schedule_slot,attempts,max_attempts FROM maintenance_runs WHERE task_name=? AND schedule_slot=?")
      .get(row.task_name, row.schedule_slot) as ClaimedRun;
  });
  return transaction.immediate();
}

async function processRun(run: ClaimedRun, logger: Logger): Promise<void> {
  const task = tasks.get(run.task_name);
  if (!task) return;
  const heartbeat = setInterval(() => {
    const now = new Date();
    db().prepare(`
      UPDATE maintenance_runs SET updated_at=?,lease_expires_at=?
      WHERE task_name=? AND schedule_slot=? AND status='running' AND lease_owner=?
    `).run(now.toISOString(), new Date(now.getTime() + leaseMs).toISOString(), run.task_name, run.schedule_slot, workerId);
  }, Math.max(5_000, Math.floor(leaseMs / 3)));
  heartbeat.unref();
  try {
    await task.run();
    const now = new Date().toISOString();
    db().prepare(`
      UPDATE maintenance_runs
      SET status='success',completed_at=?,updated_at=?,lease_owner=NULL,lease_expires_at=NULL,error_message=''
      WHERE task_name=? AND schedule_slot=? AND lease_owner=?
    `).run(now, now, run.task_name, run.schedule_slot, workerId);
    logger.info({ taskName: run.task_name, slot: run.schedule_slot }, "Maintenance task completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dead = run.attempts >= run.max_attempts;
    const retryAt = new Date(Date.now() + Math.min(60 * 60_000, 60_000 * (2 ** Math.max(0, run.attempts - 1)))).toISOString();
    db().prepare(`
      UPDATE maintenance_runs
      SET status=?,available_at=?,error_message=?,updated_at=?,lease_owner=NULL,lease_expires_at=NULL
      WHERE task_name=? AND schedule_slot=? AND lease_owner=?
    `).run(dead ? "dead" : "failed", retryAt, message, new Date().toISOString(), run.task_name, run.schedule_slot, workerId);
    logger.error({ taskName: run.task_name, slot: run.schedule_slot, attempts: run.attempts, err: message }, "Maintenance task failed");
  } finally {
    clearInterval(heartbeat);
  }
}

export async function drainMaintenanceRuns(logger: Logger, limit = 5): Promise<number> {
  let count = 0;
  while (count < limit) {
    const run = claimRun();
    if (!run) break;
    await processRun(run, logger);
    count += 1;
  }
  return count;
}

function tick(logger: Logger): void {
  enqueueDueTasks();
  if (draining) return;
  draining = true;
  setImmediate(() => { void drainMaintenanceRuns(logger).finally(() => { draining = false; }); });
}

export function startMaintenanceScheduler(logger: Logger): void {
  if (started) return;
  started = true;
  logger.info({ workerId, timeZone, pollMs, leaseMs, tasks: Array.from(tasks.keys()) }, "Durable maintenance scheduler started");
  tick(logger);
  const timer = setInterval(() => tick(logger), pollMs);
  timer.unref();
}

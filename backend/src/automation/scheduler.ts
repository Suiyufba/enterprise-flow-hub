import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { aiChat } from "../ai/client.js";
import { getDb } from "../db/index.js";
import {
  getAutomation,
  getProject,
  getRuntimeProvider,
  listEnabledAutomationsByTrigger,
  listEnabledScheduleAutomations,
  recordAutomationRun,
  runTool,
} from "../store.js";
import type { Automation } from "shared";

type Logger = {
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
};

type DailySchedule = { kind: "daily"; hour: number; minute: number; weekdaysOnly: boolean };
type IntervalSchedule = { kind: "interval"; intervalMinutes: number };
type ParsedSchedule = DailySchedule | IntervalSchedule;
type ZonedTime = { dateKey: string; weekday: string; minuteOfDay: number };
type AutomationJobRow = {
  id: string;
  automation_id: string;
  trigger_source: string;
  trigger_event: string;
  attempts: number;
  max_attempts: number;
};

const DEFAULT_TIMEZONE = process.env.AUTOMATION_TIMEZONE || process.env.TZ || "Asia/Shanghai";
const POLL_MS = Math.max(1_000, Number(process.env.AUTOMATION_POLL_MS ?? 60_000));
const JOB_POLL_MS = Math.max(500, Number(process.env.AUTOMATION_JOB_POLL_MS ?? 5_000));
const JOB_LEASE_MS = Math.max(30_000, Number(process.env.AUTOMATION_JOB_LEASE_MS ?? 10 * 60_000));
const workerId = `${hostname()}:${process.pid}:automation:${randomUUID()}`;
const running = new Set<string>();
let drainingJobs = false;
let schedulerStarted = false;

function db() { return getDb(); }

function toHalfWidth(input: string) {
  return input.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10)).replace(/：/g, ":");
}

export function parseScheduleText(input: string): ParsedSchedule | undefined {
  const normalized = toHalfWidth(input).replace(/\s+/g, "");
  const intervalMatch = normalized.match(/每(?:隔)?(\d{1,3})(分钟|分|小时|时)/);
  if (intervalMatch) {
    const amount = Number(intervalMatch[1]);
    const intervalMinutes = /小时|时/.test(intervalMatch[2]) ? amount * 60 : amount;
    if (Number.isInteger(intervalMinutes) && intervalMinutes >= 1 && intervalMinutes <= 30 * 24 * 60) {
      return { kind: "interval", intervalMinutes };
    }
    return undefined;
  }
  const timeMatch = normalized.match(/(\d{1,2})(?::|点)(\d{1,2})?分?/);
  if (!timeMatch) return undefined;
  const hour = Number(timeMatch[1]);
  const minute = timeMatch[2] === undefined ? 0 : Number(timeMatch[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return { kind: "daily", hour, minute, weekdaysOnly: /工作日|weekday/i.test(normalized) };
}

function getZonedTime(date: Date, timeZone: string): ZonedTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    minuteOfDay: (hour === 24 ? 0 : hour) * 60 + minute,
  };
}

function hasRunToday(automation: Automation, now: Date, timeZone: string) {
  if (!automation.lastRun) return false;
  const lastRun = new Date(automation.lastRun);
  if (Number.isNaN(lastRun.getTime())) return false;
  return getZonedTime(lastRun, timeZone).dateKey === getZonedTime(now, timeZone).dateKey;
}

export function isAutomationDue(automation: Automation, now: Date, timeZone: string) {
  const schedule = parseScheduleText(automation.trigger);
  if (!schedule) return false;
  if (schedule.kind === "interval") {
    if (!automation.lastRun) return true;
    const lastRun = new Date(automation.lastRun).getTime();
    return Number.isFinite(lastRun) && now.getTime() - lastRun >= schedule.intervalMinutes * 60_000;
  }
  const zoned = getZonedTime(now, timeZone);
  if (schedule.weekdaysOnly && ["Sat", "Sun"].includes(zoned.weekday)) return false;
  if (hasRunToday(automation, now, timeZone)) return false;
  return zoned.minuteOfDay >= schedule.hour * 60 + schedule.minute;
}

async function executeAutomation(automation: Automation, event?: Record<string, unknown>): Promise<string> {
  const project = getProject(automation.projectId);
  if (!project) throw new Error("自动化所属项目不存在");
  if (automation.actionType === "tool_call") {
    if (!automation.actionToolId) throw new Error("自动化没有配置业务工具");
    const toolRun = await runTool(automation.actionToolId, {
      input: { ...automation.actionInput, _enterpriseId: project.enterpriseId, _projectId: project.id, _automationId: automation.id, event: event ?? {} },
      dryRun: false,
    });
    if (!toolRun) throw new Error("自动化配置的业务工具不存在");
    if (toolRun.status === "error") throw new Error(toolRun.output);
    return toolRun.output;
  }
  if (automation.actionType === "notify") {
    const toolRun = await runTool("tool-feishu-notify", {
      input: {
        pluginId: automation.actionPluginId,
        message: [`自动化「${automation.name}」触发：${automation.action}`, event ? `事件：${JSON.stringify(event).slice(0, 800)}` : undefined].filter(Boolean).join("\n"),
      },
      dryRun: false,
    });
    if (!toolRun || toolRun.status === "error") throw new Error(toolRun?.output || "通知工具不可用");
    return toolRun.output;
  }
  if (automation.actionType === "call_ai") {
    const provider = getRuntimeProvider(automation.agentModel) ?? getRuntimeProvider();
    if (!provider) throw new Error("没有可用的模型账号");
    return await aiChat({
      systemPrompt: automation.systemPrompt || "你是企业自动化执行助手。请根据任务描述完成一次执行分析，输出执行结果、风险和后续建议。",
      userMessage: [
        `自动化任务：${automation.name}`, `触发条件：${automation.trigger}`, `执行动作：${automation.action}`,
        event ? `触发事件：${JSON.stringify(event).slice(0, 2000)}` : undefined,
        "请执行这次自动化分析；如果动作涉及删除或修改业务数据，请先输出可执行方案和安全校验，不要编造不存在的数据源。",
      ].filter(Boolean).join("\n"),
      temperature: 0.2, maxTokens: 1200, provider,
    });
  }
  throw new Error(`动作类型 ${automation.actionType} 尚未接入执行器，已阻止假运行`);
}

function acquireAutomationLease(automationId: string, ownerId: string): boolean {
  const now = new Date();
  const nowIso = now.toISOString();
  const expires = new Date(now.getTime() + JOB_LEASE_MS).toISOString();
  const result = db().prepare(`
    INSERT INTO automation_leases (automation_id, owner_id, acquired_at, heartbeat_at, lease_expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(automation_id) DO UPDATE SET
      owner_id=excluded.owner_id, acquired_at=excluded.acquired_at,
      heartbeat_at=excluded.heartbeat_at, lease_expires_at=excluded.lease_expires_at
    WHERE automation_leases.lease_expires_at <= excluded.acquired_at
       OR automation_leases.owner_id = excluded.owner_id
  `).run(automationId, ownerId, nowIso, nowIso, expires);
  return result.changes === 1;
}

function heartbeatAutomationLease(automationId: string, ownerId: string): void {
  const now = new Date();
  db().prepare(`
    UPDATE automation_leases SET heartbeat_at=?, lease_expires_at=?
    WHERE automation_id=? AND owner_id=?
  `).run(now.toISOString(), new Date(now.getTime() + JOB_LEASE_MS).toISOString(), automationId, ownerId);
}

function releaseAutomationLease(automationId: string, ownerId: string): void {
  db().prepare("DELETE FROM automation_leases WHERE automation_id=? AND owner_id=?").run(automationId, ownerId);
}

export async function runAutomationNow(automationId: string, event: Record<string, unknown>, logger?: Logger) {
  const automation = getAutomation(automationId);
  if (!automation || !automation.enabled) return undefined;
  const ownerId = `${workerId}:run:${randomUUID()}`;
  if (running.has(automation.id) || !acquireAutomationLease(automation.id, ownerId)) {
    throw new Error(`自动化「${automation.name}」正在另一个实例执行，请稍后查看运行结果`);
  }
  running.add(automation.id);
  const startedAt = Date.now();
  const now = new Date(startedAt);
  const heartbeat = setInterval(() => heartbeatAutomationLease(automation.id, ownerId), Math.max(5_000, Math.floor(JOB_LEASE_MS / 3)));
  heartbeat.unref();
  try {
    const output = await executeAutomation(automation, event);
    const updated = recordAutomationRun(automation.id, { status: "success", event, output, durationMs: Date.now() - startedAt }, now);
    logger?.info({ automationId: automation.id, name: automation.name, triggerType: automation.triggerType, runCount: updated?.runCount }, "Automation executed");
    return updated;
  } catch (error) {
    recordAutomationRun(automation.id, {
      status: "error", event, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt,
    }, now);
    throw error;
  } finally {
    clearInterval(heartbeat);
    running.delete(automation.id);
    releaseAutomationLease(automation.id, ownerId);
  }
}

export async function triggerProjectAutomations(
  triggerType: Exclude<Automation["triggerType"], "schedule" | "manual">,
  projectId: string,
  event: Record<string, unknown>,
  logger?: Logger,
) {
  const automations = listEnabledAutomationsByTrigger(triggerType, projectId);
  const results: Automation[] = [];
  for (const automation of automations) {
    try {
      const updated = await runAutomationNow(automation.id, event, logger);
      if (updated) results.push(updated);
    } catch (error) {
      logger?.error({ automationId: automation.id, name: automation.name, err: error instanceof Error ? error.message : String(error) }, `${triggerType} automation failed`);
    }
  }
  return results;
}

function feishuChatIds(automation: Automation): string[] {
  const trigger = automation.actionInput.__efhTrigger;
  if (!trigger || typeof trigger !== "object" || Array.isArray(trigger)) return [];
  const config = trigger as Record<string, unknown>;
  if (config.provider !== "feishu" || !Array.isArray(config.chatIds)) return [];
  return config.chatIds.filter((chatId): chatId is string => typeof chatId === "string" && chatId.trim().length > 0);
}

export async function triggerFeishuMessageAutomations(chatId: string, event: Record<string, unknown>, logger?: Logger) {
  const automations = listEnabledAutomationsByTrigger("message").filter((automation) => feishuChatIds(automation).includes(chatId));
  const results: Automation[] = [];
  for (const automation of automations) {
    try {
      const updated = await runAutomationNow(automation.id, event, logger);
      if (updated) results.push(updated);
    } catch (error) {
      logger?.error({ automationId: automation.id, name: automation.name, err: error instanceof Error ? error.message : String(error) }, "Feishu message automation failed");
    }
  }
  return results;
}

function scheduleDedupeKey(automation: Automation, now: Date, timeZone: string): string | undefined {
  const schedule = parseScheduleText(automation.trigger);
  if (!schedule) return undefined;
  const slot = schedule.kind === "daily"
    ? getZonedTime(now, timeZone).dateKey
    : String(Math.floor(now.getTime() / (schedule.intervalMinutes * 60_000)));
  return `schedule:${automation.id}:${slot}`;
}

function enqueueScheduledAutomation(automation: Automation, now: Date, timeZone: string): boolean {
  const active = db().prepare(`
    SELECT id FROM automation_jobs
    WHERE automation_id=? AND status IN ('pending','running','failed')
    LIMIT 1
  `).get(automation.id);
  if (active) return false;
  const dedupeKey = scheduleDedupeKey(automation, now, timeZone);
  if (!dedupeKey) return false;
  const nowIso = now.toISOString();
  const result = db().prepare(`
    INSERT OR IGNORE INTO automation_jobs
      (id,automation_id,trigger_source,trigger_event,dedupe_key,status,attempts,max_attempts,available_at,created_at,updated_at)
    VALUES (?,?,'schedule','{}',?,'pending',0,3,?,?,?)
  `).run(`ajob-${randomUUID()}`, automation.id, dedupeKey, nowIso, nowIso, nowIso);
  return result.changes === 1;
}

function claimAutomationJob(): AutomationJobRow | undefined {
  const now = new Date();
  const nowIso = now.toISOString();
  const expires = new Date(now.getTime() + JOB_LEASE_MS).toISOString();
  const transaction = db().transaction(() => {
    const candidate = db().prepare(`
      SELECT id FROM automation_jobs
      WHERE status NOT IN ('success','dead') AND available_at <= ?
        AND (status IN ('pending','failed') OR (status='running' AND lease_expires_at <= ?))
      ORDER BY available_at ASC, created_at ASC LIMIT 1
    `).get(nowIso, nowIso) as { id: string } | undefined;
    if (!candidate) return undefined;
    const updated = db().prepare(`
      UPDATE automation_jobs
      SET status='running', attempts=attempts+1, lease_owner=?, lease_expires_at=?,
          started_at=COALESCE(started_at,?), updated_at=?
      WHERE id=? AND status NOT IN ('success','dead')
        AND (status IN ('pending','failed') OR (status='running' AND lease_expires_at <= ?))
    `).run(workerId, expires, nowIso, nowIso, candidate.id, nowIso);
    if (updated.changes !== 1) return undefined;
    return db().prepare("SELECT * FROM automation_jobs WHERE id=?").get(candidate.id) as AutomationJobRow;
  });
  return transaction.immediate();
}

async function processAutomationJob(job: AutomationJobRow, logger?: Logger): Promise<void> {
  const heartbeat = setInterval(() => {
    const now = new Date();
    db().prepare(`UPDATE automation_jobs SET lease_expires_at=?, updated_at=? WHERE id=? AND status='running' AND lease_owner=?`)
      .run(new Date(now.getTime() + JOB_LEASE_MS).toISOString(), now.toISOString(), job.id, workerId);
  }, Math.max(5_000, Math.floor(JOB_LEASE_MS / 3)));
  heartbeat.unref();
  try {
    let event: Record<string, unknown> = {};
    try { event = JSON.parse(job.trigger_event) as Record<string, unknown>; } catch { /* keep empty */ }
    const updated = await runAutomationNow(job.automation_id, { ...event, source: job.trigger_source, jobId: job.id }, logger);
    if (!updated) throw new Error("自动化不存在或已停用");
    const now = new Date().toISOString();
    db().prepare(`
      UPDATE automation_jobs
      SET status='success', output=?, error_message='', completed_at=?, updated_at=?, lease_owner=NULL, lease_expires_at=NULL
      WHERE id=? AND lease_owner=?
    `).run(updated.lastOutput ?? "", now, now, job.id, workerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dead = job.attempts >= job.max_attempts;
    const availableAt = new Date(Date.now() + Math.min(5 * 60_000, 2_000 * (2 ** Math.max(0, job.attempts - 1)))).toISOString();
    db().prepare(`
      UPDATE automation_jobs
      SET status=?, error_message=?, available_at=?, updated_at=?, completed_at=?, lease_owner=NULL, lease_expires_at=NULL
      WHERE id=? AND lease_owner=?
    `).run(dead ? "dead" : "failed", message, availableAt, new Date().toISOString(), dead ? new Date().toISOString() : null, job.id, workerId);
    logger?.error({ jobId: job.id, automationId: job.automation_id, attempts: job.attempts, err: message }, "Scheduled automation job failed");
  } finally {
    clearInterval(heartbeat);
  }
}

export async function drainAutomationJobs(logger?: Logger, limit = 10): Promise<number> {
  let processed = 0;
  while (processed < limit) {
    const job = claimAutomationJob();
    if (!job) break;
    await processAutomationJob(job, logger);
    processed += 1;
  }
  return processed;
}

function kickAutomationWorker(logger?: Logger): void {
  if (drainingJobs) return;
  drainingJobs = true;
  setImmediate(() => { void drainAutomationJobs(logger).finally(() => { drainingJobs = false; }); });
}

async function scanDueAutomations(logger: Logger, timeZone: string) {
  const now = new Date();
  let queued = 0;
  for (const automation of listEnabledScheduleAutomations()) {
    if (!isAutomationDue(automation, now, timeZone)) continue;
    if (enqueueScheduledAutomation(automation, now, timeZone)) queued += 1;
  }
  if (queued > 0) logger.info({ queued, timeZone }, "Scheduled automations persisted to durable queue");
  kickAutomationWorker(logger);
}

export function startAutomationScheduler(logger: Logger) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  logger.info({ workerId, timeZone: DEFAULT_TIMEZONE, pollMs: POLL_MS, jobPollMs: JOB_POLL_MS, leaseMs: JOB_LEASE_MS }, "Durable automation scheduler started");
  void scanDueAutomations(logger, DEFAULT_TIMEZONE);
  const scanTimer = setInterval(() => { void scanDueAutomations(logger, DEFAULT_TIMEZONE); }, POLL_MS);
  scanTimer.unref();
  const workerTimer = setInterval(() => kickAutomationWorker(logger), JOB_POLL_MS);
  workerTimer.unref();
}

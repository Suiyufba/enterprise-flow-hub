import { aiChat } from "../ai/client.js";
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

type DailySchedule = {
  kind: "daily";
  hour: number;
  minute: number;
  weekdaysOnly: boolean;
};

type IntervalSchedule = {
  kind: "interval";
  intervalMinutes: number;
};

type ParsedSchedule = DailySchedule | IntervalSchedule;

type ZonedTime = {
  dateKey: string;
  weekday: string;
  minuteOfDay: number;
};

const DEFAULT_TIMEZONE = process.env.AUTOMATION_TIMEZONE || process.env.TZ || "Asia/Shanghai";
const POLL_MS = Number(process.env.AUTOMATION_POLL_MS ?? 60_000);
const running = new Set<string>();

function toHalfWidth(input: string) {
  return input
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/：/g, ":");
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
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  return {
    kind: "daily",
    hour,
    minute,
    weekdaysOnly: /工作日|weekday/i.test(normalized),
  };
}

function getZonedTime(date: Date, timeZone: string): ZonedTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
      input: {
        ...automation.actionInput,
        _enterpriseId: project.enterpriseId,
        _projectId: project.id,
        _automationId: automation.id,
        event: event ?? {},
      },
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
        message: [
          `自动化「${automation.name}」触发：${automation.action}`,
          event ? `事件：${JSON.stringify(event).slice(0, 800)}` : undefined,
        ].filter(Boolean).join("\n"),
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
        `自动化任务：${automation.name}`,
        `触发条件：${automation.trigger}`,
        `执行动作：${automation.action}`,
        event ? `触发事件：${JSON.stringify(event).slice(0, 2000)}` : undefined,
        "请执行这次自动化分析；如果动作涉及删除或修改业务数据，请先输出可执行方案和安全校验，不要编造不存在的数据源。",
      ].filter(Boolean).join("\n"),
      temperature: 0.2,
      maxTokens: 1200,
      provider,
    });
  }

  throw new Error(`动作类型 ${automation.actionType} 尚未接入执行器，已阻止假运行`);
}

export async function runAutomationNow(
  automationId: string,
  event: Record<string, unknown>,
  logger?: Logger,
) {
  const automation = getAutomation(automationId);
  if (!automation || !automation.enabled) return undefined;
  if (running.has(automation.id)) return automation;

  running.add(automation.id);
  const startedAt = Date.now();
  const now = new Date(startedAt);
  try {
    const output = await executeAutomation(automation, event);
    const updated = recordAutomationRun(automation.id, {
      status: "success",
      event,
      output,
      durationMs: Date.now() - startedAt,
    }, now);
    logger?.info(
      { automationId: automation.id, name: automation.name, triggerType: automation.triggerType, runCount: updated?.runCount },
      "Automation executed",
    );
    return updated;
  } catch (error) {
    recordAutomationRun(automation.id, {
      status: "error",
      event,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    }, now);
    throw error;
  } finally {
    running.delete(automation.id);
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
      logger?.error(
        { automationId: automation.id, name: automation.name, err: error instanceof Error ? error.message : String(error) },
        `${triggerType} automation failed`,
      );
    }
  }
  return results;
}

async function scanDueAutomations(logger: Logger, timeZone: string) {
  const now = new Date();
  const automations = listEnabledScheduleAutomations();
  for (const automation of automations) {
    if (running.has(automation.id) || !isAutomationDue(automation, now, timeZone)) continue;

    running.add(automation.id);
    const startedAt = Date.now();
    try {
      const output = await executeAutomation(automation);
      const updated = recordAutomationRun(automation.id, {
        status: "success",
        output,
        durationMs: Date.now() - startedAt,
      }, now);
      logger.info(
        { automationId: automation.id, name: automation.name, runCount: updated?.runCount, timeZone },
        "Scheduled automation executed",
      );
    } catch (error) {
      recordAutomationRun(automation.id, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      }, now);
      logger.error(
        { automationId: automation.id, name: automation.name, err: error instanceof Error ? error.message : String(error) },
        "Scheduled automation failed",
      );
    } finally {
      running.delete(automation.id);
    }
  }
}

export function startAutomationScheduler(logger: Logger) {
  logger.info({ timeZone: DEFAULT_TIMEZONE, pollMs: POLL_MS }, "Automation scheduler started");
  void scanDueAutomations(logger, DEFAULT_TIMEZONE);
  const timer = setInterval(() => {
    void scanDueAutomations(logger, DEFAULT_TIMEZONE);
  }, POLL_MS);
  timer.unref();
}

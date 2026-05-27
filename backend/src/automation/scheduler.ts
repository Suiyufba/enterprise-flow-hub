import { aiChat } from "../ai/client.js";
import { listEnabledScheduleAutomations, markAutomationRun, runTool } from "../store.js";
import type { Automation } from "shared";

type Logger = {
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
};

type ParsedSchedule = {
  hour: number;
  minute: number;
  weekdaysOnly: boolean;
};

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
  const timeMatch = normalized.match(/(\d{1,2})(?::|点)(\d{1,2})?分?/);
  if (!timeMatch) return undefined;

  const hour = Number(timeMatch[1]);
  const minute = timeMatch[2] === undefined ? 0 : Number(timeMatch[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  return {
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

function hasRunToday(automation: Automation, timeZone: string) {
  if (!automation.lastRun) return false;
  const lastRun = new Date(automation.lastRun);
  if (Number.isNaN(lastRun.getTime())) return false;
  return getZonedTime(lastRun, timeZone).dateKey === getZonedTime(new Date(), timeZone).dateKey;
}

function isDue(automation: Automation, now: Date, timeZone: string) {
  const schedule = parseScheduleText(automation.trigger);
  if (!schedule) return false;

  const zoned = getZonedTime(now, timeZone);
  if (schedule.weekdaysOnly && ["Sat", "Sun"].includes(zoned.weekday)) return false;
  if (hasRunToday(automation, timeZone)) return false;

  return zoned.minuteOfDay >= schedule.hour * 60 + schedule.minute;
}

async function executeAutomation(automation: Automation) {
  if (automation.actionType === "notify") {
    await runTool("tool-feishu-notify", {
      input: {
        pluginId: automation.actionPluginId,
        message: `自动化「${automation.name}」触发：${automation.action}`,
      },
      dryRun: false,
    });
    return;
  }

  if (automation.actionType === "call_ai") {
    await aiChat({
      systemPrompt: automation.systemPrompt || "你是企业自动化执行助手。请根据任务描述完成一次执行分析，输出执行结果、风险和后续建议。",
      userMessage: [
        `自动化任务：${automation.name}`,
        `触发条件：${automation.trigger}`,
        `执行动作：${automation.action}`,
        "请执行这次自动化分析；如果动作涉及删除或修改业务数据，请先输出可执行方案和安全校验，不要编造不存在的数据源。",
      ].join("\n"),
      temperature: 0.2,
      maxTokens: 1200,
    });
  }
}

async function scanDueAutomations(logger: Logger, timeZone: string) {
  const now = new Date();
  const automations = listEnabledScheduleAutomations();
  for (const automation of automations) {
    if (running.has(automation.id) || !isDue(automation, now, timeZone)) continue;

    running.add(automation.id);
    try {
      await executeAutomation(automation);
      const updated = markAutomationRun(automation.id, now);
      logger.info(
        { automationId: automation.id, name: automation.name, runCount: updated?.runCount, timeZone },
        "Scheduled automation executed",
      );
    } catch (error) {
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

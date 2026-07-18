import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";

const appId = process.env.FEISHU_APP_ID?.trim();
const appSecret = process.env.FEISHU_APP_SECRET?.trim();
if (!appId || !appSecret) throw new Error("飞书 MCP 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET");

const client = new lark.Client({
  appId,
  appSecret,
  domain: process.env.FEISHU_DOMAIN?.trim() || "https://open.feishu.cn",
});

function result(response: { code?: number; msg?: string; data?: unknown }) {
  const payload = response.data ?? response;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError: response.code !== undefined && response.code !== 0,
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function timestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("日期必须为 ISO 8601 格式，例如 2026-07-20T15:00:00+08:00");
  return String(Math.floor(parsed / 1000));
}

async function callOfficialApi(operation: string, payload: Record<string, unknown>) {
  if (!/^(calendar|task|docx|drive|approval|im|bitable|contact)\.v\d+\.[A-Za-z][A-Za-z0-9.]+$/.test(operation)) {
    throw new Error("不支持的飞书 operation。请使用官方 API 名称，如 calendar.v4.calendarEvent.create。");
  }
  const parts = operation.split(".");
  let owner: Record<string, unknown> = client as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = owner[part];
    if (!next || typeof next !== "object") throw new Error(`飞书 API 不存在：${operation}`);
    owner = next as Record<string, unknown>;
  }
  const method = owner[parts.at(-1)!];
  if (typeof method !== "function") throw new Error(`飞书 API 不存在：${operation}`);
  return await method.call(owner, payload);
}

const server = new McpServer({ name: "enterprise-flow-hub-feishu", version: "2.0.0" });

server.tool(
  "calendar_create_event",
  "在飞书主日历创建日程。调用前必须已经向用户确认主题、开始/结束时间、时区和参会人。",
  {
    summary: z.string().min(1),
    startAt: z.string().min(1).describe("ISO 时间，例如 2026-07-20T15:00:00+08:00"),
    endAt: z.string().min(1).describe("ISO 时间，例如 2026-07-20T16:00:00+08:00"),
    description: z.string().optional(),
    attendeeIds: z.array(z.string()).optional().describe("飞书 open_id 列表"),
    needNotification: z.boolean().optional(),
  },
  async ({ summary, startAt, endAt, description, attendeeIds, needNotification }) => {
    try {
      const primary = await client.calendar.v4.calendar.primary();
      const calendarId = primary.data?.calendars?.[0]?.calendar?.calendar_id;
      if (!calendarId) return failure("未找到可写入的飞书主日历");
      const response = await client.calendar.v4.calendarEvent.create({
        path: { calendar_id: calendarId },
        data: {
          summary,
          description,
          need_notification: needNotification ?? true,
          start_time: { timestamp: timestamp(startAt), timezone: "Asia/Shanghai" },
          end_time: { timestamp: timestamp(endAt), timezone: "Asia/Shanghai" },
          attendee_ability: "can_modify_event",
        },
      });
      const eventId = response.data?.event?.event_id;
      if (response.code === 0 && eventId && attendeeIds?.length) {
        await client.calendar.v4.calendarEventAttendee.create({
          path: { calendar_id: calendarId, event_id: eventId },
          params: { user_id_type: "open_id" },
          data: {
            attendees: attendeeIds.map((user_id) => ({ type: "user", user_id, is_optional: false })),
            need_notification: needNotification ?? true,
          },
        });
      }
      return result(response);
    } catch (error) {
      return failure(error);
    }
  },
);

server.tool(
  "api_call",
  "调用飞书官方 OpenAPI。覆盖日程、任务、文档、云盘、多维表格、群聊、审批和通讯录。operation 使用官方名称，例如 task.v2.task.create 或 docx.v1.document.create；payload 是该 API 的官方请求对象（通常包含 path、params、data）。写操作必须先获得用户确认。",
  { operation: z.string().min(1), payload: z.record(z.string(), z.unknown()).default({}) },
  async ({ operation, payload }) => {
    try {
      return result(await callOfficialApi(operation, payload));
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());

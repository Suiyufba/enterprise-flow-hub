import { EventDispatcher, LoggerLevel, WSClient } from "@larksuiteoapi/node-sdk";
import { triggerFeishuMessageAutomations } from "../automation/scheduler.js";

type Logger = {
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
};

let client: WSClient | undefined;

function toMessageEvent(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const event = data as Record<string, unknown>;
  const message = event.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return undefined;
  const rawMessage = message as Record<string, unknown>;
  const chatId = rawMessage.chat_id;
  if (typeof chatId !== "string" || !chatId) return undefined;
  let content: unknown = rawMessage.content ?? "";
  if (typeof content === "string") {
    try { content = JSON.parse(content); } catch { /* Plain-text message content is valid. */ }
  }
  return {
    provider: "feishu",
    eventId: rawMessage.message_id,
    chatId,
    chatType: rawMessage.chat_type,
    messageId: rawMessage.message_id,
    messageType: rawMessage.message_type,
    content,
    sender: event.sender,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Use Feishu's official WebSocket event channel. It avoids exposing an HTTP
 * callback and acknowledges delivery before potentially slow workflows run.
 */
export function startFeishuEventStream(logger: Logger): WSClient | undefined {
  if (client) return client;
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    logger.warn("Feishu event stream disabled: missing app credentials");
    return undefined;
  }

  const eventDispatcher = new EventDispatcher({ loggerLevel: LoggerLevel.warn }).register({
    "im.message.receive_v1": async (data: unknown) => {
      const event = toMessageEvent(data);
      if (!event) return;
      void triggerFeishuMessageAutomations(String(event.chatId), event, logger)
        .then((automations) => logger.info({ chatId: event.chatId, automationIds: automations.map((item) => item.id) }, "Feishu stream message dispatched"))
        .catch((error) => logger.error({ chatId: event.chatId, err: error instanceof Error ? error.message : String(error) }, "Feishu stream dispatch failed"));
    },
  });

  client = new WSClient({
    appId,
    appSecret,
    domain: process.env.FEISHU_DOMAIN?.trim() || "open.feishu.cn",
    loggerLevel: LoggerLevel.warn,
    onReady: () => logger.info("Feishu event stream connected"),
    onError: (error) => logger.error({ err: error.message }, "Feishu event stream failed"),
    onReconnecting: () => logger.warn("Feishu event stream reconnecting"),
    onReconnected: () => logger.info("Feishu event stream reconnected"),
  });
  void client.start({ eventDispatcher }).catch((error) => logger.error({ err: error instanceof Error ? error.message : String(error) }, "Feishu event stream start failed"));
  return client;
}

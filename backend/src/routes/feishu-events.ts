import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { triggerFeishuMessageAutomations } from "../automation/scheduler.js";

type FeishuEvent = {
  type?: string;
  token?: string;
  challenge?: string;
  header?: { event_id?: string; event_type?: string; token?: string; tenant_key?: string };
  event?: {
    message?: { chat_id?: string; chat_type?: string; message_id?: string; message_type?: string; content?: string };
    sender?: { sender_id?: Record<string, unknown>; sender_type?: string };
  };
  uuid?: string;
};

const delivered = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60_000;

function sameSecret(value: string | undefined, expected: string | undefined): boolean {
  if (!value || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

function decrypt(encrypted: string, encryptKey: string): FeishuEvent {
  const payload = Buffer.from(encrypted, "base64");
  if (payload.length <= 16) throw new Error("飞书加密事件格式无效");
  const decipher = createDecipheriv("aes-256-cbc", createHash("sha256").update(encryptKey).digest(), payload.subarray(0, 16));
  const plain = Buffer.concat([decipher.update(payload.subarray(16)), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as FeishuEvent;
}

export function parseFeishuEvent(body: unknown, verificationToken?: string, encryptKey?: string): FeishuEvent {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("飞书事件体无效");
  const raw = body as Record<string, unknown>;
  const event = typeof raw.encrypt === "string"
    ? (encryptKey ? decrypt(raw.encrypt, encryptKey) : (() => { throw new Error("飞书事件已加密，但服务未配置 FEISHU_ENCRYPT_KEY"); })())
    : raw as FeishuEvent;
  if (!sameSecret(event.header?.token ?? event.token, verificationToken)) throw new Error("飞书事件校验失败");
  return event;
}

function markDelivered(eventId: string): boolean {
  const now = Date.now();
  for (const [id, receivedAt] of delivered) if (receivedAt < now - DEDUPE_TTL_MS) delivered.delete(id);
  if (delivered.has(eventId)) return false;
  delivered.set(eventId, now);
  return true;
}

function messageEvent(event: FeishuEvent): Record<string, unknown> | undefined {
  const message = event.event?.message;
  if (!message?.chat_id) return undefined;
  let content: unknown = message.content ?? "";
  if (typeof content === "string") {
    try { content = JSON.parse(content); } catch { /* Plain-text message content is valid. */ }
  }
  return {
    provider: "feishu", eventId: event.header?.event_id ?? event.uuid, tenantKey: event.header?.tenant_key,
    chatId: message.chat_id, chatType: message.chat_type, messageId: message.message_id,
    messageType: message.message_type, content, sender: event.event?.sender, receivedAt: new Date().toISOString(),
  };
}

export async function feishuEventRoutes(app: FastifyInstance) {
  app.post("/integrations/feishu/events", async (request, reply) => {
    let event: FeishuEvent;
    try {
      event = parseFeishuEvent(request.body, process.env.FEISHU_VERIFICATION_TOKEN?.trim(), process.env.FEISHU_ENCRYPT_KEY?.trim());
    } catch (error) {
      return reply.status(401).send({ error: error instanceof Error ? error.message : "飞书事件校验失败" });
    }
    if (event.type === "url_verification") return { challenge: event.challenge };
    if ((event.header?.event_type ?? event.type) !== "im.message.receive_v1") return { ok: true, ignored: true };
    const eventId = event.header?.event_id ?? event.uuid ?? event.event?.message?.message_id;
    const payload = messageEvent(event);
    if (!eventId || !payload) return { ok: true, ignored: true };
    if (!markDelivered(eventId)) return { ok: true, duplicate: true };
    void triggerFeishuMessageAutomations(String(payload.chatId), payload, app.log)
      .then((automations) => app.log.info({ eventId, chatId: payload.chatId, automationIds: automations.map((item) => item.id) }, "Feishu message dispatched"))
      .catch((error) => app.log.error({ eventId, err: error instanceof Error ? error.message : String(error) }, "Feishu message dispatch failed"));
    return { ok: true };
  });
}

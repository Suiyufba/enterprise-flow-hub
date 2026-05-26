import { getNotificationWebhook } from "../../store.js";

export async function notifyExecute(input: Record<string, unknown>): Promise<string> {
  const pluginId = typeof input.pluginId === "string" ? input.pluginId : undefined;
  const message = typeof input.message === "string" ? input.message : JSON.stringify(input);
  const webhook = getNotificationWebhook(pluginId);
  if (!webhook) {
    return JSON.stringify({
      error: "通知插件未配置",
      hint: "请先在插件页绑定飞书或企业微信群机器人 Webhook。",
    });
  }

  const payload = {
    msg_type: "text",
    text: { content: message },
  };

  const response = await fetch(webhook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  const text = await response.text();
  if (!response.ok) {
    return JSON.stringify({ error: `HTTP ${response.status}`, body: text.slice(0, 500) });
  }

  return JSON.stringify({
    ok: true,
    pluginId: webhook.pluginId,
    response: text.slice(0, 500),
  });
}

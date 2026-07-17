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

  const payload = webhook.kind === "wecom"
    ? { msgtype: "text", text: { content: message } }
    : { msg_type: "text", content: { text: message } };

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

  let providerAccepted = true;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const code = parsed.code ?? parsed.StatusCode ?? parsed.errcode;
    providerAccepted = code === undefined || code === 0 || code === "0";
  } catch {
    providerAccepted = true;
  }
  if (!providerAccepted) throw new Error(`通知平台拒绝了请求：${text.slice(0, 300)}`);

  return JSON.stringify({
    ok: true,
    pluginId: webhook.pluginId,
    response: text.slice(0, 500),
  });
}

import * as lark from "@larksuiteoapi/node-sdk";

type FeishuChat = {
  chatId: string;
  name: string;
};

type FeishuMessage = {
  createdAt: string;
  text: string;
};

export type FeishuGroupActivity =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "choose_chat"; chats: FeishuChat[] }
  | { status: "ready"; chat: FeishuChat; messages: FeishuMessage[] };

function displayName(chat: { chat_id?: string; name?: string }): FeishuChat {
  return {
    chatId: chat.chat_id ?? "",
    name: chat.name?.trim() || "未命名群聊",
  };
}

export function selectFeishuChat(chats: FeishuChat[], request: string): FeishuChat | undefined {
  if (chats.length === 1) return chats[0];
  const normalized = request.toLocaleLowerCase();
  return chats.find((chat) => chat.name.length > 1 && normalized.includes(chat.name.toLocaleLowerCase()));
}

function messageText(content: string | undefined): string {
  if (!content) return "[无文本内容]";
  try {
    const parsed = JSON.parse(content) as { text?: unknown };
    if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text.trim();
  } catch {
    // Some Feishu message types return plain content rather than a JSON body.
  }
  return content;
}

function messageTime(timestamp: string | undefined): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Read the live group-chat path before asking the model to reason about it.
 * Some Anthropic-compatible gateways end a tool-use turn after the first MCP
 * response, so a two-step list-then-message query must be deterministic.
 */
export async function readFeishuGroupActivity(request: string): Promise<FeishuGroupActivity> {
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) return { status: "not_configured" };

  const client = new lark.Client({
    appId,
    appSecret,
    domain: process.env.FEISHU_DOMAIN?.trim() || "https://open.feishu.cn",
  });

  try {
    const chatsResult = await client.im.v1.chat.list({
      params: { page_size: 50, sort_type: "ByActiveTimeDesc" },
    });
    if (chatsResult.code !== 0) {
      return { status: "error", message: chatsResult.msg || `飞书群列表读取失败（code ${chatsResult.code ?? "unknown"}）` };
    }

    const chats = (chatsResult.data?.items ?? [])
      .map(displayName)
      .filter((chat) => chat.chatId);
    const chat = selectFeishuChat(chats, request);
    if (!chat) return { status: "choose_chat", chats };

    const messagesResult = await client.im.v1.message.list({
      params: {
        container_id_type: "chat",
        container_id: chat.chatId,
        page_size: 30,
        sort_type: "ByCreateTimeDesc",
      },
    });
    if (messagesResult.code !== 0) {
      return { status: "error", message: messagesResult.msg || `飞书群消息读取失败（code ${messagesResult.code ?? "unknown"}）` };
    }

    const messages = (messagesResult.data?.items ?? []).map((message) => ({
      createdAt: messageTime(message.create_time),
      text: messageText(message.body?.content),
    }));
    return { status: "ready", chat, messages };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export function formatFeishuGroupActivity(activity: FeishuGroupActivity): string {
  if (activity.status === "not_configured") {
    return "飞书应用凭据尚未配置，因此无法读取群聊。请在服务器环境变量中配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。";
  }
  if (activity.status === "error") {
    return `飞书接口已尝试读取，但返回错误：${activity.message}`;
  }
  if (activity.status === "choose_chat") {
    if (!activity.chats.length) return "飞书接口已连接，但当前应用机器人不在任何可访问的群聊中。请先把机器人加入目标群。";
    return `我能访问多个飞书群，请告诉我具体群名后再读取消息：${activity.chats.map((chat) => `「${chat.name}」`).join("、")}。`;
  }
  if (!activity.messages.length) return `已读取飞书群「${activity.chat.name}」，但该群暂时没有可读取的历史消息。`;

  const entries = activity.messages
    .map((message) => `- ${message.createdAt}：${message.text}`)
    .join("\n");
  return `## 飞书群聊最新动态\n\n已读取群「${activity.chat.name}」最近 ${activity.messages.length} 条消息：\n\n${entries}`;
}

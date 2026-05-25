const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface AiCallOptions {
  systemPrompt?: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  provider?: AiProviderOptions;
}

export interface AiProviderOptions {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

// OpenAI-compatible function definition
export interface FunctionDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiResponse {
  content: string;
  toolCalls: ToolCall[];
}

function buildBody(
  messages: ChatMessage[],
  options: {
    temperature: number;
    maxTokens: number;
    model: string;
    tools?: FunctionDef[];
  },
) {
  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
  return body;
}

export async function aiChat(options: AiCallOptions): Promise<string> {
  const { systemPrompt, userMessage, temperature = 0.7, maxTokens = 2048, provider } = options;
  const res = await aiChatMessages(
    [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: userMessage },
    ],
    { temperature, maxTokens, provider },
  );
  return res.content;
}

export async function aiChatMessages(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    provider?: AiProviderOptions;
    tools?: FunctionDef[];
  },
): Promise<AiResponse> {
  const { temperature = 0.7, maxTokens = 2048, provider, tools } = options ?? {};
  const baseUrl = provider?.baseUrl ?? BASE_URL;
  const apiKey = provider?.apiKey ?? API_KEY;
  const model = provider?.model ?? MODEL;

  const body = buildBody(messages, { temperature, maxTokens, model, tools });

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };

  const msg = data.choices[0]?.message;
  const content = msg?.content ?? "";

  const toolCalls: ToolCall[] = [];
  if (msg?.tool_calls) {
    for (const tc of msg.tool_calls) {
      try {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      } catch {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: { raw: tc.function.arguments },
        });
      }
    }
  }

  return { content, toolCalls };
}

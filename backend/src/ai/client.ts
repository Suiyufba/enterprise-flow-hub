const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

export async function aiChat(options: AiCallOptions): Promise<string> {
  const { systemPrompt, userMessage, temperature = 0.7, maxTokens = 2048, provider } = options;
  return aiChatMessages(
    [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: userMessage },
    ],
    { temperature, maxTokens, provider },
  );
}

export async function aiChatMessages(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; provider?: AiProviderOptions },
): Promise<string> {
  const { temperature = 0.7, maxTokens = 2048, provider } = options ?? {};
  const baseUrl = provider?.baseUrl ?? BASE_URL;
  const apiKey = provider?.apiKey ?? API_KEY;
  const model = provider?.model ?? MODEL;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? "";
}

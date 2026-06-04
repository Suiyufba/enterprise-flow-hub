import type { Message, ToolDefinition } from "shared";

// ── Hermes API Types ──

export interface HermesFunctionDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface HermesRunRequest {
  session_id: string;
  input: string;
  instructions?: string;
  conversation_history?: HermesMessage[];
  tools?: HermesFunctionDef[];
  model?: string;
  metadata?: Record<string, string>;
}

export interface HermesMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: HermesToolCall[];
}

export interface HermesToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface HermesRunResponse {
  run_id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  output?: string;
  tool_calls?: HermesToolCallResult[];
  error?: string;
}

export interface HermesToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status?: "success" | "error";
}

export interface HermesHealthResponse {
  ok: boolean;
  version?: string;
  model?: string;
}

// ── Hermes Raw SSE Event (as sent by Hermes-Agent over the wire) ──
// Hermes sends: data: {"event":"message.delta","data":{"delta":"..."}}\n\n
// The event type is INSIDE the JSON, not as an SSE "event:" line prefix.

export interface HermesRawSSEEvent {
  event: string;        // e.g. "message.delta", "tool.started", "run.completed"
  data: Record<string, unknown>;
}

// ── Normalized SSE Event Types (used internally by the runtime) ──

export type HermesSSEEvent =
  | { event: "message.delta"; data: { delta: string } }
  | { event: "tool.started"; data: { id: string; name: string; arguments: Record<string, unknown> } }
  | { event: "tool.completed"; data: { id: string; name: string; status: "success" | "error"; output: string } }
  | { event: "reasoning.available"; data: { text: string } }
  | { event: "run.completed"; data: { output: string } }
  | { event: "run.failed"; data: { error: string } }
  | { event: "unknown"; data: Record<string, unknown> };

// ── Client ──

export class HermesClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl ?? process.env.HERMES_API_URL ?? "http://hermes-agent:8642").replace(/\/$/, "");
    this.apiKey = apiKey ?? process.env.HERMES_API_KEY ?? "";
  }

  // ── Health ──

  async health(): Promise<HermesHealthResponse> {
    const res = await this.fetch("/health");
    if (!res.ok) {
      return { ok: false };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      status?: string;
      version?: string;
      model?: string;
    };
    return {
      ok: data.ok === true || data.status === "ok",
      version: data.version,
      model: data.model,
    };
  }

  // ── Create & Run ──

  async createRun(req: HermesRunRequest): Promise<HermesRunResponse> {
    const res = await this.fetch("/v1/runs", {
      method: "POST",
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Hermes createRun failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return (await res.json()) as HermesRunResponse;
  }

  // ── Get Run Status ──

  async getRun(runId: string): Promise<HermesRunResponse> {
    const res = await this.fetch(`/v1/runs/${runId}`);
    if (!res.ok) {
      throw new Error(`Hermes getRun failed: ${res.status}`);
    }
    return (await res.json()) as HermesRunResponse;
  }

  // ── Stop Run ──

  async stopRun(runId: string): Promise<void> {
    const res = await this.fetch(`/v1/runs/${runId}/stop`, { method: "POST" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Hermes stopRun failed: ${res.status}`);
    }
  }

  // ── SSE Stream ──
  // Hermes wire format: data: {"event":"message.delta","data":{...}}\n\n
  // The event type is inside the JSON payload, not as an SSE "event:" line.

  async *streamEvents(runId: string): AsyncIterable<HermesSSEEvent> {
    const res = await this.fetch(`/v1/runs/${runId}/events`, {
      headers: { Accept: "text/event-stream" },
    });
    if (!res.ok) {
      throw new Error(`Hermes streamEvents failed: ${res.status}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body for SSE stream");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          // Hermes sends event info inside the JSON data payload:
          //   data: {"event":"message.delta","data":{"delta":"hello"}}
          if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const envelope = JSON.parse(raw) as HermesRawSSEEvent;
              const eventType = envelope.event ?? "unknown";
              // Runs API events are flat objects. Keep nested-data support for
              // older Hermes builds, but normalize both shapes here.
              const payload = (
                envelope.data && Object.keys(envelope.data).length > 0
                  ? envelope.data
                  : envelope
              ) as Record<string, unknown>;

              switch (eventType) {
                case "message.delta":
                  yield { event: "message.delta", data: { delta: String(payload.delta ?? "") } };
                  break;
                case "tool.started":
                  yield {
                    event: "tool.started",
                    data: {
                      id: String(payload.id ?? payload.tool ?? "unknown"),
                      name: String(payload.name ?? payload.tool ?? "unknown"),
                      arguments: (payload.arguments ?? payload.args ?? {}) as Record<string, unknown>,
                    },
                  };
                  break;
                case "tool.completed":
                  yield {
                    event: "tool.completed",
                    data: {
                      id: String(payload.id ?? payload.tool ?? "unknown"),
                      name: String(payload.name ?? payload.tool ?? "unknown"),
                      status: payload.error ? "error" : "success",
                      output: String(payload.output ?? payload.preview ?? ""),
                    },
                  };
                  break;
                case "reasoning.available":
                  yield { event: "reasoning.available", data: { text: String(payload.text ?? "") } };
                  break;
                case "run.completed":
                  yield { event: "run.completed", data: { output: String(payload.output ?? "") } };
                  break;
                case "run.failed":
                  yield { event: "run.failed", data: { error: String(payload.error ?? "Hermes run failed") } };
                  break;
                default:
                  yield { event: "unknown", data: envelope as unknown as Record<string, unknown> };
              }
            } catch {
              // Non-JSON data line — skip
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Tool format conversion ──

  static toHermesTool(tool: ToolDefinition): HermesFunctionDef {
    let parameters: Record<string, unknown> = { type: "object", properties: {}, required: [] };
    try {
      const parsed = typeof tool.inputSchema === "string"
        ? JSON.parse(tool.inputSchema)
        : (tool.inputSchema ?? {});
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          const typ = typeof value;
          properties[key] = {
            type: typ === "number" ? "number" : typ === "boolean" ? "boolean" : "string",
            description: key,
          };
          required.push(key);
        }
        parameters = { type: "object", properties, required };
      }
    } catch {
      // fall back to empty schema
    }
    return {
      type: "function",
      function: {
        name: tool.id,
        description: tool.description,
        parameters,
      },
    };
  }

  static toHermesMessages(history: Message[]): HermesMessage[] {
    return history.slice(-24).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  // ── Private helpers ──

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> ?? {}),
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
  }
}

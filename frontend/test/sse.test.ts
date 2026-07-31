import { describe, expect, test, vi, afterEach } from "vitest";
import { connectSSE, type SSEEvent } from "../app/lib/sse";

const { fetchWithAuthMock } = vi.hoisted(() => ({ fetchWithAuthMock: vi.fn() }));
vi.mock("../app/lib/api", () => ({ fetchWithAuth: fetchWithAuthMock }));

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
}

async function collect(events: AsyncIterable<SSEEvent>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("connectSSE", () => {
  afterEach(() => fetchWithAuthMock.mockReset());

  test("emits parsed JSON events and posts the request body", async () => {
    fetchWithAuthMock.mockResolvedValue(sseResponse([
      'event: message\ndata: {"text":"hi"}\n\n',
      'event: done\ndata: {"ok":true}\n\n',
    ]));

    const events = await collect(connectSSE("/chat/stream", { message: "你好" }).events);
    expect(events).toEqual([
      { event: "message", data: { text: "hi" } },
      { event: "done", data: { ok: true } },
    ]);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchWithAuthMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/chat/stream");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ message: "你好" }));
  });

  test("reassembles events split across chunk boundaries", async () => {
    // "event:" | " task\n" | "data: {\"step\":" | "1}\n\n" — the last line is
    // deliberately delivered without its trailing newline to exercise buffering.
    fetchWithAuthMock.mockResolvedValue(sseResponse([
      "event: task\ndata: {\"step\":",
      "1}\n\nevent: task\ndata: {\"step\":2}\n\n",
    ]));

    const events = await collect(connectSSE("/chat/stream", {}).events);
    expect(events).toEqual([
      { event: "task", data: { step: 1 } },
      { event: "task", data: { step: 2 } },
    ]);
  });

  test("falls back to the raw string when data is not JSON", async () => {
    fetchWithAuthMock.mockResolvedValue(sseResponse(["data: plain text\n\n"]));
    const events = await collect(connectSSE("/chat/stream", {}).events);
    expect(events).toEqual([{ event: "", data: "plain text" }]);
  });

  test("throws the backend error message on non-ok responses", async () => {
    fetchWithAuthMock.mockResolvedValue(new Response(JSON.stringify({ error: "模型账号未配置" }), { status: 400 }));
    await expect(collect(connectSSE("/chat/stream", {}).events)).rejects.toThrow("模型账号未配置");
  });

  test("abort() terminates an open stream", async () => {
    // Simulate a fetch client that propagates the AbortSignal into the body
    // stream, which is what an open SSE connection looks like.
    fetchWithAuthMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return new Response(new ReadableStream({
        start(controller) {
          if (signal?.aborted) {
            controller.error(signal.reason);
            return;
          }
          signal?.addEventListener("abort", () => controller.error(signal.reason));
        },
      }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });

    const connection = connectSSE("/chat/stream", {});
    connection.abort();
    await expect(collect(connection.events)).rejects.toThrow();
  });

  test("attaches a bearer token when provided", async () => {
    fetchWithAuthMock.mockResolvedValue(sseResponse(["data: {}\n\n"]));
    await collect(connectSSE("/chat/stream", {}, "tok-sse").events);
    const [, init] = fetchWithAuthMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-sse");
  });
});

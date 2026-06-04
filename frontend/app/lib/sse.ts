/**
 * SSE (Server-Sent Events) client utility.
 *
 * Provides a fetch-based SSE reader that emits parsed JSON events.
 * Unlike EventSource, this supports POST requests and custom headers.
 */

export interface SSEEvent {
  event: string;
  data: unknown;
}

export interface SSEConnection {
  /** Read events as an async iterable */
  events: AsyncIterable<SSEEvent>;
  /** Abort the connection */
  abort(): void;
}

/**
 * Connect to an SSE endpoint via POST.
 * Returns an async iterable of parsed events.
 */
export function connectSSE(
  url: string,
  body: unknown,
  authToken?: string,
): SSEConnection {
  const controller = new AbortController();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  async function* eventGenerator(): AsyncIterable<SSEEvent> {
    const response = await fetch(`${apiUrl}${url}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let msg = `SSE connection failed: ${response.status}`;
      try {
        const err = JSON.parse(text);
        msg = err.error || err.detail || msg;
      } catch { /* not json */ }
      throw new Error(msg);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let currentData = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);
          } else if (line === "" && currentData) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(currentData);
            } catch {
              parsed = currentData;
            }
            yield { event: currentEvent, data: parsed };
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  return {
    events: eventGenerator(),
    abort: () => controller.abort(),
  };
}

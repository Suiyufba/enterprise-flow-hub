// Local LLM stub for E2E smoke tests. Speaks the OpenAI-compatible chat
// completions contract so the backend agent runtime can run a full round
// trip without any external API keys.
import http from "node:http";

const PORT = Number(process.env.STUB_AI_PORT ?? 4999);
const REPLY = process.env.STUB_AI_REPLY ?? "E2E 冒烟：已收到你的消息，链路正常。";

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const model = body.model ?? "stub-model";
      const payload = JSON.stringify({
        id: "chatcmpl-e2e-stub",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: REPLY },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 8, completion_tokens: 16, total_tokens: 24 },
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(payload);
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/embeddings")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }], usage: { total_tokens: 3 } }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[stub-ai] listening on http://127.0.0.1:${PORT}`);
});

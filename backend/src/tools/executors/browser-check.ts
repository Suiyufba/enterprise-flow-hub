import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (["localhost", "0.0.0.0", "::1"].includes(host)) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(host) === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/.test(host) || host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.") || host.startsWith("::ffff:192.168.");
  }
  return false;
}

async function assertPublicUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || isPrivateHost(url.hostname)) {
    throw new Error("只允许巡检公开 HTTP/HTTPS 地址");
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateHost(entry.address))) {
    throw new Error("目标域名解析到了本机或私网地址");
  }
}

export async function browserCheckExecute(input: Record<string, unknown>): Promise<string> {
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (!rawUrl) throw new Error("网页巡检需要 url");
  let url = new URL(rawUrl);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertPublicUrl(url);
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "EnterpriseFlowHub-Monitor/1.0" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) break;
    url = new URL(location, url);
  }
  if (!response) throw new Error("网页巡检没有收到响应");
  const body = (await response.text()).slice(0, 1_000_000);
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const checks = Array.isArray(input.checks) ? input.checks.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  const results = checks.map((check) => ({ check, found: body.toLowerCase().includes(check.toLowerCase()) }));
  return JSON.stringify({
    ok: response.ok && results.every((result) => result.found),
    url: response.url,
    status: response.status,
    title,
    checks: results,
  });
}

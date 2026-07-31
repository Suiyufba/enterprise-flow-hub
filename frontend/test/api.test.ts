import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  ApiError,
  AUTH_EXPIRED_EVENT,
  fetchJson,
  getSafeReturnTo,
  getStoredToken,
  getStoredUser,
  setStoredUser,
} from "../app/lib/api";

describe("getSafeReturnTo", () => {
  test("keeps same-origin paths and strips query/hash", () => {
    expect(getSafeReturnTo("/customers?page=2#top", "/")).toBe("/customers?page=2#top");
    expect(getSafeReturnTo("/", "/")).toBe("/");
  });

  test("blocks open redirects: external hosts, protocol-relative and backslashes", () => {
    expect(getSafeReturnTo("https://evil.example/phish")).toBe("/");
    expect(getSafeReturnTo("//evil.example/phish")).toBe("/");
    expect(getSafeReturnTo("https://evil.example\\@localhost/")).toBe("/");
    expect(getSafeReturnTo("\\evil.example")).toBe("/");
  });

  test("never returns to the login page and falls back on garbage", () => {
    expect(getSafeReturnTo("/login")).toBe("/");
    expect(getSafeReturnTo("javascript:alert(1)")).toBe("/");
    expect(getSafeReturnTo("mailto:admin@example.com")).toBe("/");
    expect(getSafeReturnTo(null, "/fallback")).toBe("/fallback");
  });
});

describe("session storage helpers", () => {
  beforeEach(() => localStorage.clear());

  test("setStoredUser persists user without token; token stored separately", () => {
    setStoredUser({ id: "u1", enterpriseId: "ent-1", username: "alice", displayName: "Alice", role: "admin", createdAt: "", token: "tok-123" });
    expect(getStoredToken()).toBe("tok-123");
    const user = getStoredUser();
    expect(user?.username).toBe("alice");
    expect(user?.token).toBeUndefined();
  });

  test("setStoredUser(null) clears both keys", () => {
    setStoredUser({ id: "u1", enterpriseId: "ent-1", username: "alice", displayName: "Alice", role: "member", createdAt: "" });
    setStoredUser(null);
    expect(getStoredToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  test("getStoredUser tolerates corrupted JSON", () => {
    localStorage.setItem("efh_user", "{not json");
    expect(getStoredUser()).toBeNull();
  });
});

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  test("sends JSON content type with body and parses JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const result = await fetchJson<{ ok: boolean }>("/workspace", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/workspace");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  test("throws ApiError with backend error message on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "用户名已存在" }), { status: 409 }));
    await expect(fetchJson("/auth/register")).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "用户名已存在",
    });
  });

  test("expires the session and dispatches event on 401 outside login", async () => {
    localStorage.setItem("efh_token", "tok-expired");
    const dispatch = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, dispatch);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(fetchJson("/workspace")).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem("efh_token")).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_EXPIRED_EVENT, dispatch);
  });

  test("does not expire session on 401 from the login endpoint", async () => {
    localStorage.setItem("efh_token", "tok-keep");
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("bad credentials", { status: 401 }));
    await expect(fetchJson("/auth/login", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem("efh_token")).toBe("tok-keep");
  });

  test("attaches Bearer token only to the configured API origin", async () => {
    localStorage.setItem("efh_token", "tok-abc");
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200, headers: { "Content-Type": "application/json" } }));
    globalThis.fetch = fetchMock;
    await fetchJson("/workspace");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith("http://localhost:4000")).toBe(true);
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok-abc");
  });
});

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const API = API_URL;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isUnauthorizedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Only allow redirects within the current origin. Returning a path instead of
 * the original absolute URL also keeps client-side navigation predictable.
 */
export function getSafeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;

  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  try {
    if (value.includes("\\")) return fallback;
    const target = new URL(value, origin);
    if (target.origin !== origin || !target.pathname.startsWith("/")) return fallback;
    if (target.pathname === "/login") return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

// ---- Auth helpers ----

const AUTH_KEY = "efh_user";
const TOKEN_KEY = "efh_token";
export const AUTH_EXPIRED_EVENT = "efh-auth-expired";

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as { id: string; enterpriseId: string; username: string; displayName: string; role: "admin" | "member"; createdAt: string; token?: string }) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: { id: string; enterpriseId: string; username: string; displayName: string; role: "admin" | "member"; createdAt: string; token?: string } | null) {
  if (typeof window === "undefined") return;
  if (user) {
    if (user.token) localStorage.setItem(TOKEN_KEY, user.token);
    localStorage.setItem(AUTH_KEY, JSON.stringify({
      id: user.id,
      enterpriseId: user.enterpriseId,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    }));
  } else {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function expireStoredSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function getResponseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `请求失败 (${response.status})`;

  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string") return body.error;
    if (typeof body.message === "string") return body.message;
  } catch {
    // The backend may return plain text for proxy and infrastructure errors.
  }

  return text;
}

// ---- HTTP ----

export async function fetchWithAuth(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  const url = pathOrUrl.startsWith("/") ? `${API_URL}${pathOrUrl}` : pathOrUrl;
  const headers = new Headers(init?.headers);
  const sessionToken = getStoredToken();
  const baseOrigin = new URL(API_URL, typeof window === "undefined" ? "http://localhost" : window.location.origin).origin;
  const requestUrl = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (sessionToken && requestUrl.origin === baseOrigin && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && !requestUrl.pathname.endsWith("/auth/login")) {
    expireStoredSession();
  }
  return response;
}

export async function fetchJson<T>(path: string, init?: RequestInit & { adminUserId?: string }): Promise<T> {
  const { adminUserId, ...fetchInit } = init ?? {} as Record<string, unknown>;
  const headers: Record<string, string> = {};
  if ((fetchInit as RequestInit)?.body) {
    headers["Content-Type"] = "application/json";
  }
  // Product APIs only accept the signed browser session. Never ship a shared
  // backend key in the frontend bundle.
  if (adminUserId) {
    headers["x-user-id"] = adminUserId as string;
  }
  if ((fetchInit as RequestInit)?.headers) {
    Object.assign(headers, (fetchInit as RequestInit).headers as Record<string, string>);
  }
  const response = await fetchWithAuth(path, { ...fetchInit as RequestInit, headers });

  if (!response.ok) {
    const message = await getResponseErrorMessage(response);
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

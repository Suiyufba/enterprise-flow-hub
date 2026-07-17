const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const API = API_URL;

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

// ---- HTTP ----

export async function fetchJson<T>(path: string, init?: RequestInit & { adminUserId?: string }): Promise<T> {
  const { adminUserId, ...fetchInit } = init ?? {} as Record<string, unknown>;
  const headers: Record<string, string> = {};
  if ((fetchInit as RequestInit)?.body) {
    headers["Content-Type"] = "application/json";
  }
  // Product APIs only accept the signed browser session. Never ship a shared
  // backend key in the frontend bundle.
  const sessionToken = getStoredToken();
  if (sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  }
  if (adminUserId) {
    headers["x-user-id"] = adminUserId as string;
  }
  if ((fetchInit as RequestInit)?.headers) {
    Object.assign(headers, (fetchInit as RequestInit).headers as Record<string, string>);
  }
  const response = await fetch(`${API_URL}${path}`, { ...fetchInit as RequestInit, headers });

  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      expireStoredSession();
    }
    throw new Error(await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

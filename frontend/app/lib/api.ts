const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

export const API = API_URL;

// ---- Auth helpers ----

const AUTH_KEY = "efh_user";

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as { id: string; enterpriseId: string; username: string; displayName: string; role: "admin" | "member"; createdAt: string }) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: { id: string; enterpriseId: string; username: string; displayName: string; role: "admin" | "member"; createdAt: string } | null) {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_KEY);
  }
}

// ---- HTTP ----

export async function fetchJson<T>(path: string, init?: RequestInit & { adminUserId?: string }): Promise<T> {
  const { adminUserId, ...fetchInit } = init ?? {} as Record<string, unknown>;
  const headers: Record<string, string> = {};
  if ((fetchInit as RequestInit)?.body) {
    headers["Content-Type"] = "application/json";
  }
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  if (adminUserId) {
    headers["x-user-id"] = adminUserId as string;
  }
  if ((fetchInit as RequestInit)?.headers) {
    Object.assign(headers, (fetchInit as RequestInit).headers as Record<string, string>);
  }
  const response = await fetch(`${API_URL}${path}`, { ...fetchInit as RequestInit, headers });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

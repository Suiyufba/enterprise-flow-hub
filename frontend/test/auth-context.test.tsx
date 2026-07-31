import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../app/lib/auth-context";
import type { User } from "shared";

const { fetchJsonMock } = vi.hoisted(() => ({ fetchJsonMock: vi.fn() }));

vi.mock("../app/lib/api", () => ({
  AUTH_EXPIRED_EVENT: "efh-auth-expired",
  getStoredUser: () => {
    try {
      const raw = localStorage.getItem("efh_user");
      return raw ? JSON.parse(raw) as User : null;
    } catch {
      return null;
    }
  },
  getStoredToken: () => localStorage.getItem("efh_token"),
  setStoredUser: (user: (User & { token?: string }) | null) => {
    if (user) {
      if (user.token) localStorage.setItem("efh_token", user.token);
      localStorage.setItem("efh_user", JSON.stringify({
        id: user.id,
        enterpriseId: user.enterpriseId,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      }));
    } else {
      localStorage.removeItem("efh_user");
      localStorage.removeItem("efh_token");
    }
  },
  isUnauthorizedError: (error: unknown) => (error as { status?: number })?.status === 401,
  fetchJson: fetchJsonMock,
}));

const user: User = {
  id: "u1",
  enterpriseId: "ent-1",
  username: "alice",
  displayName: "Alice",
  role: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function Probe() {
  const { user: current, loading, error, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{current?.username ?? ""}</span>
      <span data-testid="error">{error ?? ""}</span>
      <button onClick={() => void login("alice", "pw")}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchJsonMock.mockReset();
  });

  test("no stored session means no validation request", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("");
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });

  test("valid stored session is restored from /auth/me", async () => {
    localStorage.setItem("efh_user", JSON.stringify(user));
    localStorage.setItem("efh_token", "tok-valid");
    fetchJsonMock.mockResolvedValue({ user });

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("alice"));
    expect(fetchJsonMock).toHaveBeenCalledWith("/auth/me");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("error").textContent).toBe("");
    // The refreshed identity is persisted with the token preserved.
    expect(localStorage.getItem("efh_token")).toBe("tok-valid");
  });

  test("401 clears the stored session", async () => {
    localStorage.setItem("efh_user", JSON.stringify(user));
    localStorage.setItem("efh_token", "tok-stale");
    fetchJsonMock.mockRejectedValue({ status: 401, message: "expired" });

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe(""));
    expect(localStorage.getItem("efh_user")).toBeNull();
    expect(localStorage.getItem("efh_token")).toBeNull();
  });

  test("network outage keeps the local identity and shows a retryable error", async () => {
    localStorage.setItem("efh_user", JSON.stringify(user));
    localStorage.setItem("efh_token", "tok-keep");
    fetchJsonMock.mockRejectedValue(new Error("network down"));

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("error").textContent).toContain("暂时无法验证登录状态"));
    expect(screen.getByTestId("user").textContent).toBe("alice");
    expect(localStorage.getItem("efh_token")).toBe("tok-keep");
  });

  test("login stores the session; logout clears it", async () => {
    fetchJsonMock.mockResolvedValue({ ...user, token: "tok-login" });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    screen.getByRole("button", { name: "login" }).click();
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("alice"));
    expect(fetchJsonMock).toHaveBeenCalledWith("/auth/login", expect.objectContaining({ method: "POST" }));
    expect(localStorage.getItem("efh_token")).toBeTruthy();

    screen.getByRole("button", { name: "logout" }).click();
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe(""));
    expect(localStorage.getItem("efh_user")).toBeNull();
    expect(localStorage.getItem("efh_token")).toBeNull();
  });

  test("an auth-expired event from the API layer logs the user out", async () => {
    localStorage.setItem("efh_user", JSON.stringify(user));
    localStorage.setItem("efh_token", "tok-valid");
    fetchJsonMock.mockResolvedValue({ user });

    renderAuth();
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("alice"));

    window.dispatchEvent(new Event("efh-auth-expired"));
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe(""));
  });
});

import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { TypingIndicator } from "../app/components/TypingIndicator";

vi.mock("../app/lib/gsap", () => ({
  gsap: { to: vi.fn() },
  useGSAP: (callback: () => void) => { callback(); },
}));

describe("TypingIndicator", () => {
  test("announces the AI typing state with three dots", () => {
    const { container } = render(<TypingIndicator />);
    const indicator = container.querySelector(".chat-typing");
    expect(indicator?.getAttribute("role")).toBe("status");
    expect(indicator?.getAttribute("aria-label")).toBe("AI 正在输入...");
    expect(container.querySelectorAll(".chat-typing span")).toHaveLength(3);
  });
});

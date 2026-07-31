import { describe, expect, test, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MarkdownMessage from "../app/components/MarkdownMessage";

vi.mock("../app/lib/anime", () => ({
  animate: vi.fn(),
  spring: () => ({ mass: 1, stiffness: 100, damping: 12, velocity: 0 }),
}));

const writeText = vi.fn().mockResolvedValue(undefined);

describe("MarkdownMessage", () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  test("renders user messages as plain text without markdown processing", () => {
    const { container } = render(<MarkdownMessage role="user" content={"**加粗**\n\n- 列表"} />);
    expect(container.querySelector(".chat-msg-user")).toBeTruthy();
    expect(container.querySelector(".chat-msg-user")?.textContent).toContain("**加粗**");
    expect(container.querySelector("strong")).toBeNull();
  });

  test("renders GFM markdown for assistant messages", () => {
    const { container } = render(<MarkdownMessage role="assistant" content={[
      "| 状态 | 数量 |",
      "| --- | --- |",
      "| 逾期 | 3 |",
      "",
      "`code` 与 **重点**",
      "",
      "- [x] 已完成",
    ].join("\n")} />);
    expect(container.querySelector(".chat-msg-assistant")).toBeTruthy();
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelector("code")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("重点");
  });

  test("copy button writes the full source text to the clipboard", async () => {
    render(<MarkdownMessage role="assistant" content={"# 标题\n\n正文"} />);
    fireEvent.click(screen.getByTitle("复制"));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("# 标题\n\n正文"));
    // Feedback flips to 已复制.
    await vi.waitFor(() => expect(screen.getByTitle("已复制")).toBeTruthy());
  });
});

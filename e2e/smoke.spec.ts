import { expect, test, type Page } from "@playwright/test";

// The smoke suite covers the product's main chain: login -> chat round trip
// -> automation workflow save. Tests run serially against one shared backend
// instance with a fresh seeded DB and a stub LLM.

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("demo123");
  await page.locator(".login-submit").click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("主链路冒烟", () => {
  test("登录后进入工作台", async ({ page }) => {
    await login(page);
    // Sidebar navigation is present and the session token is persisted.
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.getByRole("link", { name: /自动化/ }).first()).toBeVisible();
    const token = await page.evaluate(() => localStorage.getItem("efh_token"));
    expect(token).toBeTruthy();
  });

  test("对话链路：消息发出并收到助手回复", async ({ page }) => {
    await login(page);
    await page.goto("/chat/new");
    await page.locator(".chat-input").fill("E2E 测试：请确认链路正常");
    await page.locator(".chat-send-btn").click();

    // The composer navigates into the new conversation.
    await expect(page).toHaveURL(/\/chat\/chat-/);
    await expect(page.locator(".chat-msg-user", { hasText: "E2E 测试" }).first()).toBeVisible();

    // The stub LLM reply arrives through the full agent pipeline.
    await expect(
      page.locator(".chat-msg-assistant", { hasText: "E2E 冒烟" }).first(),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("自动化：创建工作流并保存为业务工具动作", async ({ page }) => {
    await login(page);
    await page.goto("/automation/workflow");

    // Select the action node and configure it as a business-tool action.
    const actionNode = page.locator(".react-flow__node", { hasText: "动作" }).first();
    await expect(actionNode).toBeVisible();
    await actionNode.click();
    const panel = page.locator(".wf-props");
    await expect(panel).toBeVisible();
    await panel.getByRole("combobox").first().selectOption("tool_call");
    await panel.getByRole("combobox").nth(1).selectOption("tool-business-action");

    const workflowName = `E2E 工作流 ${Date.now()}`;
    await page.locator(".wf-title-input").fill(workflowName);
    await page.getByRole("button", { name: "保存", exact: true }).click();

    // Saved: redirected to the edit page and the workflow is restored there.
    await expect(page).toHaveURL(/\/automation\/workflow\/auto-/, { timeout: 30_000 });
    await expect(page.locator(".wf-title-input")).toHaveValue(workflowName);

    // The new workflow is visible in the automation list.
    await page.goto("/automation");
    await expect(page.getByText(workflowName).first()).toBeVisible();
  });
});

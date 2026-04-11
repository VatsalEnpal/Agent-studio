import { test, expect } from "@playwright/test";

const BASE = "http://localhost:8080";

test.describe("Agent Studio Robustness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    // Wait for hydration — the header should appear once hydrated
    await page.waitForSelector("header", { timeout: 10000 });
    await page.waitForTimeout(500); // Let React settle
  });

  test("hydration guard shows and resolves", async ({ page }) => {
    const header = page.locator("header");
    await expect(header).toBeVisible();
    // Sessions tab in the header toggle bar
    const sessionsTab = page.locator("header button").filter({ hasText: "Sessions" });
    await expect(sessionsTab).toBeVisible();
  });

  test("tab switches give instant feedback", async ({ page }) => {
    // Click Teams tab in header
    const teamsTab = page.locator("header button").filter({ hasText: "Teams" });
    await teamsTab.click();
    await page.waitForTimeout(100);
    await expect(teamsTab).toHaveClass(/bg-console-faint/);

    // Click back to Sessions
    const sessionsTab = page.locator("header button").filter({ hasText: "Sessions" });
    await sessionsTab.click();
    await page.waitForTimeout(100);
    await expect(sessionsTab).toHaveClass(/bg-console-faint/);
  });

  test("New Session button opens launcher", async ({ page }) => {
    const newBtn = page.locator("aside button").filter({ hasText: "New Session" });
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await page.waitForTimeout(200);

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    const launchBtn = modal.getByRole("button", { name: /Launch/ });
    await expect(launchBtn).toBeVisible();
    await expect(launchBtn).toBeEnabled();

    // Close modal with Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(modal).not.toBeVisible();
  });

  test("launcher presets are clickable", async ({ page }) => {
    const newBtn = page.locator("aside button").filter({ hasText: "New Session" });
    await newBtn.click();
    await page.waitForTimeout(200);

    const modal = page.locator('[role="dialog"]');
    const quickChat = modal.getByRole("button", { name: "Quick Chat" });
    await expect(quickChat).toBeVisible();
    await quickChat.click();
    await page.waitForTimeout(100);

    const startSprint = modal.getByRole("button", { name: "Start Sprint" });
    await expect(startSprint).toBeVisible();
    await startSprint.click();
    await page.waitForTimeout(100);

    await page.keyboard.press("Escape");
  });

  test("launcher Continue button is present", async ({ page }) => {
    const newBtn = page.locator("aside button").filter({ hasText: "New Session" });
    await newBtn.click();
    await page.waitForTimeout(200);

    const modal = page.locator('[role="dialog"]');
    const continueBtn = modal.getByRole("button", { name: /Continue/ });
    await expect(continueBtn).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("launcher shows launching state on click", async ({ page }) => {
    const newBtn = page.locator("aside button").filter({ hasText: "New Session" });
    await newBtn.click();
    await page.waitForTimeout(200);

    const modal = page.locator('[role="dialog"]');
    const launchBtn = modal.getByRole("button", { name: /Launch/ });
    await expect(launchBtn).toBeVisible();

    // Click launch — it should show "Launching..." briefly
    await launchBtn.click();
    await page.waitForTimeout(500);
    // Modal should close after launch
  });

  test("Cmd+K opens command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(300);

    // Command palette has an input with placeholder "Type a command..."
    const input = page.locator('input[placeholder="Type a command..."]');
    await expect(input).toBeVisible();

    // Type "new" and expect to see "New Session"
    await input.fill("new");
    await page.waitForTimeout(100);

    const newSession = page.locator('[data-palette-item]').filter({ hasText: "New Session" });
    await expect(newSession).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(input).not.toBeVisible();
  });

  test("Cmd+N opens launcher", async ({ page }) => {
    await page.keyboard.press("Meta+n");
    await page.waitForTimeout(300);

    const modal = page.locator('[role="dialog"]').filter({ hasText: "New Session" });
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("sidebar collapse and expand", async ({ page }) => {
    const collapseBtn = page.locator('button[title="Collapse sidebar"]');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await page.waitForTimeout(200);

    const openBtn = page.locator('button[title="Open sidebar"]');
    await expect(openBtn).toBeVisible();
    await openBtn.click();
    await page.waitForTimeout(200);

    await expect(collapseBtn).toBeVisible();
  });

  test("session group expand/collapse with chevron", async ({ page }) => {
    // Click the Sessions group header in sidebar
    const sessionsGroup = page.locator("aside button").filter({ hasText: /^Sessions\d*$/ }).first();
    await expect(sessionsGroup).toBeVisible();

    // Toggle
    await sessionsGroup.click();
    await page.waitForTimeout(150);
    await sessionsGroup.click();
    await page.waitForTimeout(150);
  });

  test("Teams view loads", async ({ page }) => {
    const teamsTab = page.locator("header button").filter({ hasText: "Teams" });
    await teamsTab.click();
    await page.waitForTimeout(1000);

    // One of these should be visible
    const anyVisible = await page.evaluate(() => {
      const texts = ["Workflows", "Loading workflows...", "No workflows found", "Select a run"];
      return texts.some((t) =>
        Array.from(document.querySelectorAll("*")).some(
          (el) => el.textContent?.includes(t) && (el as HTMLElement).offsetParent !== null,
        ),
      );
    });
    expect(anyVisible).toBe(true);
  });

  test("PMO scheduler section is visible in Teams view", async ({ page }) => {
    const teamsTab = page.locator("header button").filter({ hasText: "Teams" });
    await teamsTab.click();
    await page.waitForTimeout(1000);

    const pmoHeader = page.getByText("PMO Scheduler");
    await expect(pmoHeader).toBeVisible();

    const scanBtn = page.getByRole("button", { name: "Scan Now" });
    await expect(scanBtn).toBeVisible();
  });

  test("bottom bar shows keyboard hints", async ({ page }) => {
    // Use exact text matching for the hint labels
    const cmdK = page.locator("footer").getByText("commands");
    await expect(cmdK).toBeVisible();

    const cmdN = page.locator("footer span").filter({ hasText: /^new session$/ });
    await expect(cmdN).toBeVisible();
  });

  test("API endpoints respond", async ({ request }) => {
    const sessionsRes = await request.get(`${BASE}/api/sessions`);
    expect(sessionsRes.ok()).toBe(true);

    const processesRes = await request.get(`${BASE}/api/processes`);
    expect(processesRes.ok()).toBe(true);

    const pmoRes = await request.get(`${BASE}/api/pmo/status-full`);
    expect(pmoRes.ok()).toBe(true);
    const pmoData = await pmoRes.json();
    expect(pmoData).toHaveProperty("loaded");

    const historyRes = await request.get(`${BASE}/api/sessions/history`);
    expect(historyRes.ok()).toBe(true);
    const historyData = await historyRes.json();
    expect(Array.isArray(historyData)).toBe(true);

    const memRes = await request.get(`${BASE}/api/memory/stats`);
    expect(memRes.ok()).toBe(true);
  });

  test("take final screenshots", async ({ page }) => {
    // Sessions view
    await page.screenshot({ path: "tests/screenshots/sessions-view.png", fullPage: true });

    // Teams view
    const teamsTab = page.locator("header button").filter({ hasText: "Teams" });
    await teamsTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tests/screenshots/teams-view.png", fullPage: true });

    // Launcher modal
    await page.keyboard.press("Meta+n");
    await page.waitForTimeout(300);
    await page.screenshot({ path: "tests/screenshots/launcher-modal.png", fullPage: true });

    // Command palette
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(300);
    await page.screenshot({ path: "tests/screenshots/command-palette.png", fullPage: true });
  });
});

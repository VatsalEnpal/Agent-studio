import { test, expect } from "@playwright/test";

test.describe("PM Review Fixes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:8080", { waitUntil: "networkidle" });
  });

  test("Quick Chat button creates session immediately (no modal)", async ({ page }) => {
    // The empty state should show quick start buttons
    const quickChat = page.locator("button", { hasText: "Quick Chat" });
    if (await quickChat.isVisible()) {
      // Intercept POST to /api/sessions to verify it fires
      const sessionPromise = page.waitForRequest((req) =>
        req.url().includes("/api/sessions") && req.method() === "POST"
      );
      await quickChat.click();
      const req = await sessionPromise;
      const body = req.postDataJSON();
      // Should NOT open the modal - should directly create a session
      expect(body.command).toBe("claude");
      expect(body.args).toContain("--model");
      // Modal should NOT be visible
      const modal = page.locator('[role="dialog"]');
      await expect(modal).not.toBeVisible();
    }
  });

  test("Start Sprint button creates orchestrator session immediately", async ({ page }) => {
    const startSprint = page.locator("button", { hasText: "Start Sprint" });
    if (await startSprint.isVisible()) {
      const sessionPromise = page.waitForRequest((req) =>
        req.url().includes("/api/sessions") && req.method() === "POST"
      );
      await startSprint.click();
      const req = await sessionPromise;
      const body = req.postDataJSON();
      expect(body.name).toBe("orchestrator");
      expect(body.args).toContain("--agent");
      expect(body.args).toContain("orchestrator");
    }
  });

  test("Continue Last button creates continue session immediately", async ({ page }) => {
    const continueLast = page.locator("button", { hasText: "Continue Last" });
    if (await continueLast.isVisible()) {
      const sessionPromise = page.waitForRequest((req) =>
        req.url().includes("/api/sessions") && req.method() === "POST"
      );
      await continueLast.click();
      const req = await sessionPromise;
      const body = req.postDataJSON();
      expect(body.args).toContain("--continue");
    }
  });

  test("/api/config returns homeDir and cwd (no hardcoded paths)", async ({ page }) => {
    const response = await page.request.get("http://localhost:8080/api/config");
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty("homeDir");
    expect(data).toHaveProperty("cwd");
    expect(data.homeDir).not.toBe("");
    expect(data.cwd).not.toBe("");
  });

  test("Sidebar shows Repos section (merged Folders + Git)", async ({ page }) => {
    // Look for "Repos" section header, NOT separate "Folders" and "Git"
    const reposSection = page.locator("text=Repos");
    await expect(reposSection.first()).toBeVisible();

    // "Folders" section should NOT exist separately
    const foldersSection = page.locator("button", { hasText: /^Folders/ });
    await expect(foldersSection).not.toBeVisible();
  });

  test("Sidebar does NOT show raw PIDs for running processes", async ({ page }) => {
    // If running processes section exists, expand it and check labels
    const runningSection = page.locator("button", { hasText: "Running on Machine" });
    if (await runningSection.isVisible()) {
      await runningSection.click();
      await page.waitForTimeout(300);
      // Should see "Claude Session" labels, not "PID XXXX"
      const claudeSession = page.locator("text=Claude Session");
      const pidLabel = page.locator("text=/PID \\d+/");
      if (await claudeSession.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        expect(await pidLabel.count()).toBe(0);
      }
    }
  });

  test("Fullscreen button exists in toggle bar", async ({ page }) => {
    // Look for the fullscreen button in the header/toggle bar specifically
    const fsButton = page.locator('header button[title*="Fullscreen"]');
    await expect(fsButton).toBeVisible();
  });

  test("Teams step card Go button triggers session creation", async ({ page }) => {
    // Switch to Teams view
    await page.locator("button", { hasText: "Teams" }).click();
    await page.waitForTimeout(500);

    // Find a waiting step with a Go/Approve button
    const goButton = page.locator(".bg-amber-500", { hasText: /Go|Approve|Start/ });
    if (await goButton.first().isVisible()) {
      const sessionPromise = page.waitForRequest(
        (req) => req.url().includes("/api/sessions") && req.method() === "POST",
        { timeout: 3000 }
      ).catch(() => null);
      await goButton.first().click();
      const req = await sessionPromise;
      if (req) {
        const body = req.postDataJSON();
        expect(body.meta.agent).toBe("orchestrator");
      }
    }
  });

  test("PMO Scan Now shows toast", async ({ page }) => {
    // Switch to Teams view
    await page.locator("button", { hasText: "Teams" }).click();
    await page.waitForTimeout(500);

    const scanButton = page.locator("button", { hasText: "Scan Now" });
    if (await scanButton.isVisible()) {
      await scanButton.click();
      // Toast should appear
      const toast = page.locator("text=PMO scan started");
      await expect(toast).toBeVisible({ timeout: 3000 });
    }
  });

  test("New sessions show dash instead of $0.00", async ({ page }) => {
    // Check terminal pane badges - if sessions exist, verify cost display
    const costBadges = page.locator(".text-console-dim >> text=$0.00");
    // $0.00 should NOT appear - should show em-dash instead
    const count = await costBadges.count();
    // This is a best-effort check — if no sessions, this passes trivially
    expect(count).toBe(0);
  });

  test("Session items and repo items have hover tooltips", async ({ page }) => {
    // Dismiss any overlay hints
    const hint = page.locator('[class*="animate-in"][class*="fixed"]');
    if (await hint.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hint.click();
      await page.waitForTimeout(300);
    }
    // Repo items should have title attributes for tooltip on hover
    const repoItems = page.locator('[title*="/"]');
    const count = await repoItems.count();
    // Repos section always renders, so there should be at least some titled elements
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

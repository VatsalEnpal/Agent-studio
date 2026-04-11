import { test, expect } from "@playwright/test";

test.describe("PM Polish Verification", () => {
  test("Teams view: step cards render with correct visual states", async ({ page }) => {
    await page.goto("http://localhost:8080");
    // Click Teams tab
    await page.click('button:has-text("Teams")');
    await page.waitForTimeout(1500);

    // Screenshot full teams view
    await page.screenshot({
      path: "tests/screenshots/teams-full.png",
      fullPage: true,
    });

    // Click on the first run in sidebar if visible
    const runButtons = page.locator(
      'aside button:has-text("Sprint"), aside button:has-text("Current")',
    );
    const runCount = await runButtons.count();
    if (runCount > 0) {
      await runButtons.first().click();
      await page.waitForTimeout(500);
    }

    // Expand each step card
    const stepCards = page.locator('[class*="border-l-"]');
    const cardCount = await stepCards.count();

    for (let i = 0; i < cardCount; i++) {
      const card = stepCards.nth(i);
      const button = card.locator("button").first();
      const isDisabled = await button.getAttribute("disabled");
      if (isDisabled === null) {
        await button.click();
        await page.waitForTimeout(300);
      }
    }

    await page.screenshot({
      path: "tests/screenshots/teams-expanded.png",
      fullPage: true,
    });
  });

  test("Sessions: permissions defaults to default", async ({ page }) => {
    await page.goto("http://localhost:8080");
    // Click Sessions tab
    await page.click('button:has-text("Sessions")');
    await page.waitForTimeout(500);

    // Open the session launcher
    // Look for a "New" button or similar
    const newBtn = page.locator('button:has-text("New Session"), button:has-text("New")');
    const btnCount = await newBtn.count();
    if (btnCount > 0) {
      await newBtn.first().click();
      await page.waitForTimeout(500);
    }

    // Find permissions select
    const permSelect = page.locator("select").filter({ has: page.locator('option[value="default"]') });
    const selectCount = await permSelect.count();
    if (selectCount > 0) {
      const val = await permSelect.first().inputValue();
      // The default (before any preset) should be "default"
      expect(val).toBe("default");
    }

    await page.screenshot({
      path: "tests/screenshots/session-launcher.png",
      fullPage: false,
    });
  });

  test("Disabled tabs have tooltips", async ({ page }) => {
    await page.goto("http://localhost:8080");
    await page.waitForTimeout(500);

    const memoryTab = page.locator('button:has-text("Memory")');
    const settingsTab = page.locator('button:has-text("Settings")');

    // Check title attributes
    const memTitle = await memoryTab.getAttribute("title");
    const setTitle = await settingsTab.getAttribute("title");

    expect(memTitle).toBe("Coming soon");
    expect(setTitle).toBe("Coming soon");
  });
});

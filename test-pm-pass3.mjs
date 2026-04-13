import { chromium } from "playwright";

const BASE = "http://localhost:8080";
const DIR = "test-screenshots/pm-polish";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("favicon")) {
      errors.push(msg.text());
    }
  });

  // 1. Command palette
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/20-command-palette.png`, fullPage: false });
  console.log("20 - Command palette captured");

  // Type "sprint" to filter
  await page.keyboard.type("sprint");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/21-command-palette-filtered.png`, fullPage: false });
  console.log("21 - Command palette filtered captured");

  // Close
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 2. Test mode toggle preserves state
  await page.click('button:has-text("Teams")');
  await page.waitForTimeout(1500);

  // Expand a step
  const specStep = page.locator('button:has-text("Generate Spec")').first();
  if (await specStep.isVisible()) {
    await specStep.click();
    await page.waitForTimeout(500);
  }

  // Switch to sessions and back
  await page.click('button:has-text("Sessions")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Teams")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/22-toggle-preserved.png`, fullPage: false });
  console.log("22 - Mode toggle state captured");

  // 3. Keyboard shortcut Cmd+N opens launcher
  await page.click('button:has-text("Sessions")');
  await page.waitForTimeout(500);
  await page.keyboard.press("Meta+n");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/23-launcher-modal.png`, fullPage: false });
  console.log("23 - Launcher modal captured");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 4. Test sidebar toggle
  await page.keyboard.press("Meta+\\");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/24-sidebar-collapsed.png`, fullPage: false });
  console.log("24 - Sidebar collapsed captured");

  await page.keyboard.press("Meta+\\");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/25-sidebar-restored.png`, fullPage: false });
  console.log("25 - Sidebar restored captured");

  // 5. Verify all dates are nicely formatted (not raw ISO)
  await page.click('button:has-text("Teams")');
  await page.waitForTimeout(1500);

  // Check if any ISO strings are visible in the page
  const pageContent = await page.textContent("body");
  const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g;
  const isoMatches = pageContent?.match(isoPattern);
  if (isoMatches && isoMatches.length > 0) {
    console.log("WARNING: Found raw ISO date strings:", isoMatches.slice(0, 3));
  } else {
    console.log("OK: No raw ISO dates visible");
  }

  // 6. Check for any text that says "placeholder", "N/A", or bare "--"
  const badPatterns = ["placeholder", "N/A"];
  for (const pattern of badPatterns) {
    if (pageContent?.toLowerCase().includes(pattern.toLowerCase())) {
      console.log(`WARNING: Found "${pattern}" in page content`);
    }
  }

  // 7. All 8 agent names present somewhere
  const agentNames = ["orchestrator", "backend", "frontend", "qa", "security", "pmo"];
  for (const name of agentNames) {
    if (pageContent?.toLowerCase().includes(name)) {
      console.log(`OK: Agent name "${name}" found`);
    } else {
      console.log(`WARNING: Agent name "${name}" NOT found`);
    }
  }

  console.log("\nConsole errors:", errors.length > 0 ? errors : "NONE");
  await browser.close();
}

main().catch(console.error);

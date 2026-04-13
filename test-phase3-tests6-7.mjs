/**
 * Phase 3 QA Tests 6 & 7 — Toggle back and console checks
 * Fixes: use exact role locator for Sessions button to avoid ambiguity
 */
import { chromium } from "playwright";

const BASE_URL = "http://localhost:8080";
const SCREENSHOT_DIR = "/Users/vatsalbhatt230813/Code/InPipeline/agent-console/test-screenshots/phase3";

const results = [];
const consoleErrors = [];
const networkFailures = [];

function log(test, status, detail) {
  const entry = { test, status, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  const icon = status === "PASS" ? "PASS" : status === "FAIL" ? "FAIL" : "WARN";
  console.log(`[${icon}] ${test}: ${detail}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ text: msg.text(), url: msg.location().url });
    }
  });

  // Capture network failures
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkFailures.push({ url: response.url(), status: response.status() });
    }
  });

  try {
    // Navigate and switch to Teams first
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await sleep(2000);

    // Use the toggle bar button (the first one, not the sidebar one)
    // The toggle bar uses exact button with icon + label in header
    const teamsBtn = page.getByRole('button', { name: 'Teams', exact: true });
    await teamsBtn.click();
    await sleep(3000);

    // Verify we're on Teams
    const sprintContent = await page.locator('text=/tasks complete/').count();
    log("6.0", sprintContent > 0 ? "PASS" : "FAIL",
      sprintContent > 0 ? "Teams view loaded successfully" : "Teams view not loaded");

    // =====================================================
    // TEST 6: Switch Back
    // =====================================================
    console.log("\n=== TEST 6: Switch Back ===");

    // Use exact button name to get the toggle bar Sessions button (not sidebar)
    const sessionsBtn = page.getByRole('button', { name: 'Sessions', exact: true });
    await sessionsBtn.click();
    await sleep(2000);

    // Check that sprint hero is gone
    const sprintHeroGone = await page.locator('text=/tasks complete/').count();
    log("6.1", sprintHeroGone === 0 ? "PASS" : "FAIL",
      sprintHeroGone === 0 ? "Sprint hero not visible in Sessions view (correct)" : "Sprint hero still visible in Sessions (wrong)");

    // Check that Sessions-specific UI is visible
    // In Sessions mode, the main area should show terminal grid or launch button
    const sessionsActive = await page.locator('button:has-text("Sessions")').first().getAttribute("class");
    const isActive = sessionsActive && sessionsActive.includes("bg-console-faint");
    log("6.1a", isActive ? "PASS" : "FAIL",
      isActive ? "Sessions tab is visually active (highlighted)" : "Sessions tab not visually active");

    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_sessions_view.png`, fullPage: true });

    // Click Teams again
    await teamsBtn.click();
    await sleep(2000);

    // Verify data still there
    const sprintStillThere = await page.locator('text=/tasks complete/').count();
    log("6.2", sprintStillThere > 0 ? "PASS" : "FAIL",
      sprintStillThere > 0 ? "Teams data still present after toggling back" : "Teams data lost after toggle");

    const memoryStillThere = await page.locator('text="102"').count();
    log("6.3", memoryStillThere > 0 ? "PASS" : "FAIL",
      memoryStillThere > 0 ? "Memory count still shows 102 after toggle" : "Memory count lost after toggle");

    // Check Activity Feed still has entries
    const feedStillThere = await page.locator('text="Activity Feed"').count();
    log("6.4", feedStillThere > 0 ? "PASS" : "FAIL",
      feedStillThere > 0 ? "Activity Feed still visible after toggle" : "Activity Feed lost after toggle");

    await page.screenshot({ path: `${SCREENSHOT_DIR}/08_teams_back.png`, fullPage: true });

    // =====================================================
    // TEST 7: Console Clean
    // =====================================================
    console.log("\n=== TEST 7: Console Clean ===");

    // Filter out known non-issues
    const realErrors = consoleErrors.filter((e) => {
      const t = e.text.toLowerCase();
      if (t.includes("websocket") && (t.includes("close") || t.includes("connection"))) return false;
      if (t.includes("hmr") || t.includes("hot module") || t.includes("turbopack")) return false;
      if (t.includes("favicon")) return false;
      if (t.includes("hydration")) return false;
      if (t.includes("source map")) return false;
      if (t.includes("downloadable font")) return false;
      return true;
    });

    log("7.1", realErrors.length === 0 ? "PASS" : "FAIL",
      realErrors.length === 0
        ? `0 real console errors (${consoleErrors.length} total, all filtered as dev noise)`
        : `${realErrors.length} real console errors found`);

    if (realErrors.length > 0) {
      for (const err of realErrors.slice(0, 5)) {
        console.log(`  ERROR: ${err.text.slice(0, 300)}`);
      }
    }

    if (consoleErrors.length > 0) {
      console.log(`  (All ${consoleErrors.length} console messages for transparency:)`);
      for (const err of consoleErrors.slice(0, 10)) {
        console.log(`    ${err.text.slice(0, 150)}`);
      }
    }

    // Network failures
    const realNetworkFailures = networkFailures.filter((f) => {
      if (f.url.includes("favicon")) return false;
      if (f.url.includes(".map")) return false;
      return true;
    });

    log("7.2", realNetworkFailures.length === 0 ? "PASS" : "FAIL",
      realNetworkFailures.length === 0
        ? "All API calls succeeded (no 4xx/5xx responses)"
        : `${realNetworkFailures.length} failed network requests`);

    if (realNetworkFailures.length > 0) {
      for (const f of realNetworkFailures.slice(0, 5)) {
        console.log(`  NETWORK FAIL: ${f.status} ${f.url}`);
      }
    }

  } catch (err) {
    console.error("Test error:", err);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/99_error_tests6_7.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("QA TESTS 6-7 RESULTS");
  console.log("=".repeat(60));

  const passes = results.filter((r) => r.status === "PASS").length;
  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;

  console.log(`Total: ${results.length} checks | PASS: ${passes} | FAIL: ${fails} | WARN: ${warns}`);

  for (const r of results) {
    const icon = r.status === "PASS" ? "+" : r.status === "FAIL" ? "X" : "?";
    console.log(`  [${icon}] ${r.test}: ${r.detail}`);
  }

  // Append to report
  const fs = await import("node:fs");
  try {
    const existing = JSON.parse(fs.readFileSync(`${SCREENSHOT_DIR}/report.json`, "utf-8"));
    existing.results_tests_6_7 = results;
    existing.console_errors_tests_6_7 = consoleErrors;
    existing.network_failures_tests_6_7 = networkFailures;
    fs.writeFileSync(`${SCREENSHOT_DIR}/report.json`, JSON.stringify(existing, null, 2));
  } catch {
    fs.writeFileSync(`${SCREENSHOT_DIR}/report_tests6_7.json`, JSON.stringify({ results, consoleErrors, networkFailures }, null, 2));
  }
}

main().catch(console.error);

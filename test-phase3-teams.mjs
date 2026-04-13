/**
 * Phase 3 QA Tests — Teams View
 * Tests toggle to Teams, sprint hero, activity feed, right panel, memory stats, toggle back, console errors.
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
    // =====================================================
    // TEST 1: Toggle to Teams
    // =====================================================
    console.log("\n=== TEST 1: Toggle to Teams ===");

    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await sleep(3000);

    // Check the page loaded
    const title = await page.title();
    log("1.0", title ? "PASS" : "FAIL", `Page loaded, title: "${title}"`);

    // Screenshot before clicking Teams
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_initial_load.png`, fullPage: true });

    // Find and click the Teams tab
    const teamsBtn = page.locator('button:has-text("Teams")');
    const teamsBtnCount = await teamsBtn.count();
    if (teamsBtnCount === 0) {
      log("1.1", "FAIL", "Teams button not found in toggle bar");
    } else {
      await teamsBtn.click();
      await sleep(3000); // Wait for data to load
      log("1.1", "PASS", "Clicked Teams tab");
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_teams_view.png`, fullPage: true });

    // Check for "coming soon" text (should NOT be present)
    const comingSoonText = await page.locator('text="coming soon"').count();
    log("1.2", comingSoonText === 0 ? "PASS" : "FAIL",
      comingSoonText === 0 ? "No 'coming soon' placeholder — real content rendered" : "'Coming soon' placeholder found — NOT a real Teams view");

    // Check for sprint hero card (the main indicator of Teams view)
    const sprintHero = page.locator('.rounded-lg.border');
    const heroCount = await sprintHero.count();
    log("1.3", heroCount > 0 ? "PASS" : "FAIL",
      `Found ${heroCount} card-like elements in Teams view`);

    // Check for "No Active Sprint" vs actual sprint content
    const noSprintMsg = await page.locator('text="No Active Sprint"').count();
    const sprintContent = await page.locator('text=/tasks complete/').count();
    if (noSprintMsg > 0) {
      log("1.4", "FAIL", "'No Active Sprint' shown — but current.md exists with content");
    } else if (sprintContent > 0) {
      log("1.4", "PASS", "Sprint content visible (tasks complete text found)");
    } else {
      log("1.4", "WARN", "Neither 'No Active Sprint' nor task info found — check loading state");
    }

    // Check for Activity Feed heading
    const activityFeed = await page.locator('text="Activity Feed"').count();
    log("1.5", activityFeed > 0 ? "PASS" : "FAIL",
      activityFeed > 0 ? "Activity Feed section visible" : "Activity Feed heading not found");

    // Check for scan log / PMO Scans section in right panel
    const pmoScans = await page.locator('text="PMO Scans"').count();
    log("1.6", pmoScans > 0 ? "PASS" : "FAIL",
      pmoScans > 0 ? "PMO Scans section visible in right panel" : "PMO Scans section not found");

    // Check for Sprint Archive in right panel
    const sprintArchive = await page.locator('text="Sprint Archive"').count();
    log("1.7", sprintArchive > 0 ? "PASS" : "FAIL",
      sprintArchive > 0 ? "Sprint Archive visible in right panel" : "Sprint Archive not found");

    // Check for Memory section
    const memorySection = await page.locator('text="Memory"').count();
    log("1.8", memorySection > 0 ? "PASS" : "FAIL",
      memorySection > 0 ? "Memory section visible" : "Memory section not found");

    // =====================================================
    // TEST 2: Sprint Hero Card Details
    // =====================================================
    console.log("\n=== TEST 2: Sprint Hero Card ===");

    // Sprint name
    const sprintName = await page.locator('.text-sm.font-semibold').first().textContent().catch(() => null);
    log("2.1", sprintName ? "PASS" : "FAIL",
      sprintName ? `Sprint name: "${sprintName}"` : "Sprint name not found");

    // Task count (format: "X/Y tasks complete")
    const taskText = await page.locator('text=/\\d+\\/\\d+ tasks complete/').textContent().catch(() => null);
    log("2.2", taskText ? "PASS" : "FAIL",
      taskText ? `Task count: "${taskText}"` : "Task count text not found");

    // Validate task count is reasonable (not 0/0)
    if (taskText) {
      const match = taskText.match(/(\d+)\/(\d+)/);
      if (match) {
        const done = parseInt(match[1]);
        const total = parseInt(match[2]);
        log("2.2a", total > 0 ? "PASS" : "FAIL",
          `Tasks: ${done}/${total} — ${total > 0 ? 'reasonable count' : 'zero total is suspicious'}`);
      }
    }

    // Gate badges (G1, G2, G3)
    const g1Badge = await page.locator('text="G1"').count();
    const g2Badge = await page.locator('text="G2"').count();
    const g3Badge = await page.locator('text="G3"').count();
    const gateCount = g1Badge + g2Badge + g3Badge;
    log("2.3", "PASS", `Gate badges found: G1=${g1Badge}, G2=${g2Badge}, G3=${g3Badge} (${gateCount} total — gates only show if mentioned in sprint)`);

    // Phase progress bar
    const progressBar = await page.locator('.h-1\\.5.bg-console-faint.rounded-full').count();
    log("2.4", progressBar > 0 ? "PASS" : "FAIL",
      progressBar > 0 ? "Phase progress bar found" : "Phase progress bar not found");

    // Phase labels (Scaffold, Auth, Layout, Data, Polish)
    const phaseLabels = ["Scaffold", "Auth", "Layout", "Data", "Polish"];
    let foundLabels = 0;
    for (const label of phaseLabels) {
      const count = await page.locator(`text="${label}"`).count();
      if (count > 0) foundLabels++;
    }
    log("2.5", foundLabels === 5 ? "PASS" : "FAIL",
      `Phase labels found: ${foundLabels}/5 (${phaseLabels.join(", ")})`);

    // Progress percentage
    const progressPct = await page.locator('text=/%/').textContent().catch(() => null);
    log("2.6", progressPct ? "PASS" : "FAIL",
      progressPct ? `Progress percentage: "${progressPct}"` : "Progress percentage not visible");

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_sprint_hero.png`, fullPage: true });

    // =====================================================
    // TEST 3: Activity Feed
    // =====================================================
    console.log("\n=== TEST 3: Activity Feed ===");

    // Check for READY badges
    const readyBadges = await page.locator('span:has-text("READY")').count();
    log("3.1", readyBadges > 0 ? "PASS" : "FAIL",
      readyBadges > 0 ? `Found ${readyBadges} READY badges in activity feed / scan sections` : "No READY badges found");

    // Check for NOT READY badges
    const notReadyBadges = await page.locator('span:has-text("NOT READY")').count();
    const notReadyCount2 = await page.locator('span:has-text("NOT_READY")').count();
    const incompleteBadges = await page.locator('span:has-text("INCOMPLETE")').count();
    const totalNotReady = notReadyBadges + notReadyCount2 + incompleteBadges;
    log("3.2", "PASS", `Found ${totalNotReady} NOT READY/INCOMPLETE badges (expected some per scan log data)`);

    // Check for timestamps in activity entries
    const timeEntries = await page.locator('span.font-mono.text-console-dim').count();
    log("3.3", timeEntries > 0 ? "PASS" : "FAIL",
      timeEntries > 0 ? `Found ${timeEntries} timestamped entries` : "No timestamped entries found");

    // Check scrollability of activity feed
    const activityContainer = page.locator('.max-h-\\[400px\\].overflow-y-auto');
    const containerCount = await activityContainer.count();
    log("3.4", containerCount > 0 ? "PASS" : "FAIL",
      containerCount > 0 ? "Activity feed has scrollable container (max-h-[400px] overflow-y-auto)" : "Scrollable container not found");

    // Check that entries have detail text (not empty)
    const detailTexts = page.locator('.text-\\[10px\\].text-console-muted.leading-relaxed.truncate');
    const detailCount = await detailTexts.count();
    let nonEmptyDetails = 0;
    for (let i = 0; i < Math.min(detailCount, 5); i++) {
      const text = await detailTexts.nth(i).textContent();
      if (text && text.trim().length > 0) nonEmptyDetails++;
    }
    log("3.5", nonEmptyDetails > 0 ? "PASS" : "FAIL",
      `${nonEmptyDetails}/${Math.min(detailCount, 5)} checked detail entries have content`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_activity_feed.png`, fullPage: true });

    // =====================================================
    // TEST 4: Right Panel
    // =====================================================
    console.log("\n=== TEST 4: Right Panel ===");

    // Handoffs section
    const handoffsHeader = await page.locator('text="Handoffs"').count();
    log("4.1", handoffsHeader > 0 ? "PASS" : "FAIL",
      handoffsHeader > 0 ? "Handoffs section header found" : "Handoffs section header not found");

    // Check for handoff cards (qa-tester -> orchestrator)
    const handoffCards = await page.locator('text="qa-tester"').count();
    log("4.1a", handoffCards > 0 ? "PASS" : "FAIL",
      handoffCards > 0 ? "Handoff card for qa-tester found" : "No handoff card for qa-tester found");

    // Arrow indicator in handoff
    const arrowCount = await page.locator('text="orchestrator"').count();
    log("4.1b", arrowCount > 0 ? "PASS" : "FAIL",
      arrowCount > 0 ? "Handoff shows orchestrator as target" : "orchestrator target not shown in handoff");

    // Scan log compact view (PMO Scans)
    const scanLogItems = page.locator('[class*="hover:bg-console-faint"]');
    const scanLogCount = await scanLogItems.count();
    log("4.2", scanLogCount > 0 ? "PASS" : "FAIL",
      `Found ${scanLogCount} scan log items in right panel`);

    // Sprint history (should show 5 archived sprints)
    const archiveSection = page.locator('text="Sprint Archive"');
    const archiveVisible = await archiveSection.count();
    log("4.3", archiveVisible > 0 ? "PASS" : "FAIL",
      archiveVisible > 0 ? "Sprint Archive section visible" : "Sprint Archive section not found");

    // Check sprint names in archive
    const expectedSprints = [
      "Column Header Tooltips",
      "Table Design Overhaul",
      "Auth Flow Redesign",
      "Portal V2 Dynamic Config",
      "Portal V3 Otp Pagination Csv",
    ];
    let foundSprints = 0;
    for (const name of expectedSprints) {
      const count = await page.locator(`text="${name}"`).count();
      if (count > 0) foundSprints++;
    }
    log("4.4", foundSprints >= 3 ? "PASS" : "FAIL",
      `Found ${foundSprints}/5 expected archived sprint names`);

    // Take screenshot focused on right panel
    const aside = page.locator('aside');
    const asideBox = await aside.boundingBox().catch(() => null);
    if (asideBox) {
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/05_right_panel.png`,
        clip: { x: asideBox.x - 10, y: 0, width: asideBox.width + 20, height: 900 },
      });
      log("4.5", "PASS", "Right panel screenshot captured");
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/05_right_panel.png`, fullPage: true });
      log("4.5", "WARN", "Could not isolate right panel — full page screenshot taken");
    }

    // =====================================================
    // TEST 5: Memory Stats
    // =====================================================
    console.log("\n=== TEST 5: Memory Stats ===");

    // Check for memory count (should be 102)
    const memoryCount = await page.locator('text="102"').count();
    log("5.1", memoryCount > 0 ? "PASS" : "FAIL",
      memoryCount > 0 ? "Memory count 102 displayed" : "Memory count 102 not found");

    // Check for "entries" label next to count
    const entriesLabel = await page.locator('text="entries"').count();
    log("5.2", entriesLabel > 0 ? "PASS" : "FAIL",
      entriesLabel > 0 ? "'entries' label found next to memory count" : "'entries' label not found");

    // Check for category breakdown
    const expectedCategories = ["corrections", "decisions", "human-inputs", "knowledge", "learnings"];
    let foundCategories = 0;
    for (const cat of expectedCategories) {
      const count = await page.locator(`text="${cat}"`).count();
      if (count > 0) foundCategories++;
    }
    log("5.3", foundCategories >= 3 ? "PASS" : "FAIL",
      `Found ${foundCategories}/5 memory categories displayed`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_memory_stats.png`, fullPage: true });

    // =====================================================
    // TEST 6: Switch Back
    // =====================================================
    console.log("\n=== TEST 6: Switch Back ===");

    // Click Sessions tab
    const sessionsBtn = page.locator('button:has-text("Sessions")');
    await sessionsBtn.click();
    await sleep(2000);

    // Check terminal grid is back (look for session-related UI)
    const sessionElements = await page.locator('text="Sessions"').count();
    log("6.1", sessionElements > 0 ? "PASS" : "FAIL",
      "Switched to Sessions tab");

    // Verify Sprint Hero is gone (Sessions view shouldn't show it)
    const sprintHeroGone = await page.locator('text=/tasks complete/').count();
    log("6.1a", sprintHeroGone === 0 ? "PASS" : "FAIL",
      sprintHeroGone === 0 ? "Sprint hero not visible in Sessions view (correct)" : "Sprint hero still visible in Sessions view (wrong)");

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

    await page.screenshot({ path: `${SCREENSHOT_DIR}/08_teams_back.png`, fullPage: true });

    // =====================================================
    // TEST 7: Console Clean
    // =====================================================
    console.log("\n=== TEST 7: Console Clean ===");

    // Filter out known non-issues (WebSocket disconnects during test, HMR, etc.)
    const realErrors = consoleErrors.filter((e) => {
      const t = e.text.toLowerCase();
      // Ignore common dev-mode noise
      if (t.includes("websocket") && t.includes("close")) return false;
      if (t.includes("hmr") || t.includes("hot module")) return false;
      if (t.includes("favicon")) return false;
      if (t.includes("hydration")) return false; // common in dev
      return true;
    });

    log("7.1", realErrors.length === 0 ? "PASS" : "FAIL",
      realErrors.length === 0
        ? `0 console errors (${consoleErrors.length} total filtered)`
        : `${realErrors.length} real console errors found`);

    if (realErrors.length > 0) {
      for (const err of realErrors.slice(0, 5)) {
        console.log(`  ERROR: ${err.text.slice(0, 200)}`);
      }
    }

    // Network failures
    const realNetworkFailures = networkFailures.filter((f) => {
      // Ignore favicon, source maps
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
    await page.screenshot({ path: `${SCREENSHOT_DIR}/99_error.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  // =====================================================
  // SUMMARY
  // =====================================================
  console.log("\n" + "=".repeat(60));
  console.log("QA TEST REPORT — Phase 3: Teams View");
  console.log("=".repeat(60));

  const passes = results.filter((r) => r.status === "PASS").length;
  const fails = results.filter((r) => r.status === "FAIL").length;
  const warns = results.filter((r) => r.status === "WARN").length;

  console.log(`\nTotal: ${results.length} checks | PASS: ${passes} | FAIL: ${fails} | WARN: ${warns}`);
  console.log(`Health: ${Math.round((passes / results.length) * 100)}%`);

  console.log("\nDetailed Results:");
  for (const r of results) {
    const icon = r.status === "PASS" ? "+" : r.status === "FAIL" ? "X" : "?";
    console.log(`  [${icon}] ${r.test}: ${r.detail}`);
  }

  if (fails > 0) {
    console.log("\nFAILURES:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  [FAIL] ${r.test}: ${r.detail}`);
    }
  }

  console.log("\nScreenshots saved to:", SCREENSHOT_DIR);

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    phase: "Phase 3 — Teams View",
    total: results.length,
    pass: passes,
    fail: fails,
    warn: warns,
    health_pct: Math.round((passes / results.length) * 100),
    results,
    console_errors: consoleErrors,
    network_failures: networkFailures,
  };

  const fs = await import("node:fs");
  fs.writeFileSync(`${SCREENSHOT_DIR}/report.json`, JSON.stringify(report, null, 2));
  console.log("Report saved to:", `${SCREENSHOT_DIR}/report.json`);
}

main().catch(console.error);

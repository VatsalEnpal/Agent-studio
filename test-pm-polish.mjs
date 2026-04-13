import { chromium } from "playwright";

const BASE = "http://localhost:8080";
const DIR = "test-screenshots/pm-polish";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Load Sessions mode
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/01-sessions-empty.png`, fullPage: false });
  console.log("01 - Sessions empty state captured");

  // 2. Switch to Teams mode
  await page.click('button:has-text("Teams")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${DIR}/02-teams-overview.png`, fullPage: false });
  console.log("02 - Teams overview captured");

  // 3. Click on current run (should be auto-selected)
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/03-teams-current-run.png`, fullPage: false });
  console.log("03 - Teams current run captured");

  // 4. Expand PMO Scan step
  const pmoStep = page.locator('button:has-text("PMO Scan")').first();
  if (await pmoStep.isVisible()) {
    await pmoStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/04-pmo-scan-expanded.png`, fullPage: false });
    console.log("04 - PMO Scan expanded captured");
    // Collapse
    await pmoStep.click();
    await page.waitForTimeout(200);
  }

  // 5. Expand Readiness Report
  const readinessStep = page.locator('button:has-text("Readiness Report")').first();
  if (await readinessStep.isVisible()) {
    await readinessStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/05-readiness-expanded.png`, fullPage: false });
    console.log("05 - Readiness Report expanded captured");
    await readinessStep.click();
    await page.waitForTimeout(200);
  }

  // 6. Expand Sprint Approval
  const approvalStep = page.locator('button:has-text("Sprint Approval")').first();
  if (await approvalStep.isVisible()) {
    await approvalStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/06-approval-expanded.png`, fullPage: false });
    console.log("06 - Sprint Approval expanded captured");
    await approvalStep.click();
    await page.waitForTimeout(200);
  }

  // 7. Expand Generate Spec
  const specStep = page.locator('button:has-text("Generate Spec")').first();
  if (await specStep.isVisible()) {
    await specStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/07-spec-expanded.png`, fullPage: false });
    console.log("07 - Generate Spec expanded captured");
    await specStep.click();
    await page.waitForTimeout(200);
  }

  // 8. Expand Backend Build
  const backendStep = page.locator('button:has-text("Backend Build")').first();
  if (await backendStep.isVisible()) {
    await backendStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/08-backend-gate.png`, fullPage: false });
    console.log("08 - Backend Build gate captured");
    await backendStep.click();
    await page.waitForTimeout(200);
  }

  // 9. Expand Frontend Build
  const frontendStep = page.locator('button:has-text("Frontend Build")').first();
  if (await frontendStep.isVisible()) {
    await frontendStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/09-frontend-gate.png`, fullPage: false });
    console.log("09 - Frontend Build gate captured");
    await frontendStep.click();
    await page.waitForTimeout(200);
  }

  // 10. Expand QA Testing
  const qaStep = page.locator('button:has-text("QA Testing")').first();
  if (await qaStep.isVisible()) {
    await qaStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/10-qa-gate.png`, fullPage: false });
    console.log("10 - QA Testing gate captured");
    await qaStep.click();
    await page.waitForTimeout(200);
  }

  // 11. Expand Deploy
  const deployStep = page.locator('button:has-text("Deploy")').first();
  if (await deployStep.isVisible()) {
    await deployStep.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/11-deploy-expanded.png`, fullPage: false });
    console.log("11 - Deploy expanded captured");
    await deployStep.click();
    await page.waitForTimeout(200);
  }

  // 12. Flow sidebar detail
  await page.screenshot({ path: `${DIR}/12-sidebar-detail.png`, fullPage: false });
  console.log("12 - Sidebar detail captured");

  // 13. System panel - hover over memory
  const memoryRow = page.locator('text=Memory').first();
  if (await memoryRow.isVisible()) {
    await memoryRow.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/13-system-memory-hover.png`, fullPage: false });
    console.log("13 - System memory hover captured");
  }

  // 14. Switch back to Sessions mode
  await page.click('button:has-text("Sessions")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${DIR}/14-sessions-mode.png`, fullPage: false });
  console.log("14 - Sessions mode captured");

  // 15. Check console for errors
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Teams")');
  await page.waitForTimeout(2000);

  // 16. Laptop width test (1280px)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/15-laptop-width.png`, fullPage: false });
  console.log("15 - Laptop width captured");

  // 17. Expand PMO scan and click "View all entries"
  const pmoStep2 = page.locator('button:has-text("PMO Scan")').first();
  if (await pmoStep2.isVisible()) {
    await pmoStep2.click();
    await page.waitForTimeout(500);
    const viewAll = page.locator('button:has-text("View all")').first();
    if (await viewAll.isVisible()) {
      await viewAll.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/16-pmo-all-entries.png`, fullPage: false });
      console.log("16 - PMO all entries captured");
    }
  }

  console.log("\nAll screenshots captured. Console errors:", errors.length > 0 ? errors : "NONE");
  await browser.close();
}

main().catch(console.error);

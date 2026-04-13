/**
 * High-res screenshots of Teams view for visual verification
 */
import { chromium } from "playwright";

const BASE_URL = "http://localhost:8080";
const DIR = "/Users/vatsalbhatt230813/Code/InPipeline/agent-console/test-screenshots/phase3";

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // 2x resolution
  });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await sleep(2000);

  // Click Teams
  const teamsBtn = page.getByRole('button', { name: 'Teams', exact: true });
  await teamsBtn.click();
  await sleep(3000);

  // Full page screenshot at 2x
  await page.screenshot({ path: `${DIR}/10_teams_full_2x.png`, fullPage: true });

  // Sprint hero area (top-left)
  await page.screenshot({
    path: `${DIR}/11_sprint_hero_crop.png`,
    clip: { x: 210, y: 40, width: 900, height: 300 },
  });

  // Right panel
  await page.screenshot({
    path: `${DIR}/12_right_panel_crop.png`,
    clip: { x: 1100, y: 40, width: 340, height: 860 },
  });

  // Activity feed area
  await page.screenshot({
    path: `${DIR}/13_activity_feed_crop.png`,
    clip: { x: 210, y: 340, width: 900, height: 500 },
  });

  await browser.close();
  console.log("Screenshots saved to:", DIR);
}

main().catch(console.error);

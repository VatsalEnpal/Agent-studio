import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/test-screenshots/phase4';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(3000);

  // Go to Teams view
  const teamsTab = await page.$('button:has-text("Teams")');
  if (teamsTab) {
    await teamsTab.click();
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'teams-full-1440.png'), fullPage: true });
  }

  // Also get the launcher dialog screenshot at higher res
  const sessionsTab = await page.$('button:has-text("Sessions")');
  if (sessionsTab) await sessionsTab.click();
  await sleep(500);

  await page.keyboard.press('Meta+n');
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'launcher-dialog.png') });
  await page.keyboard.press('Escape');
  await sleep(300);

  // Bottom bar close-up - set viewport narrow to see wrapping
  await page.setViewportSize({ width: 800, height: 600 });
  await sleep(500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'bottom-bar-narrow.png') });

  await browser.close();
  console.log('Done');
}

test().catch(e => {
  console.error('Crashed:', e);
  process.exit(1);
});

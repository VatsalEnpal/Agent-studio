import { chromium } from 'playwright';
import path from 'path';

const SCREENSHOT_DIR = './test-screenshots/qa-run';
const BASE_URL = 'http://localhost:8080';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });

  // TEST: Session Launcher - verify model selector exists
  console.log('=== Verifying Session Launcher ===');
  const newSessionBtn = page.locator('text=/New Session/i').first();
  await newSessionBtn.click();
  await page.waitForTimeout(1000);

  // Get full modal text
  const modalText = await page.evaluate(() => {
    const modal = document.querySelector('[class*=modal], [class*=dialog], [role=dialog]');
    return modal ? modal.innerText : document.body.innerText;
  });
  console.log('Modal text excerpt:', modalText.substring(0, 500));

  // Check for MODEL label
  const modelLabel = await page.locator('text=MODEL').isVisible().catch(() => false);
  console.log('MODEL label visible:', modelLabel);

  // Check for sonnet in dropdown
  const sonnetText = await page.locator('text=sonnet').first().isVisible().catch(() => false);
  console.log('sonnet text visible:', sonnetText);

  // Check for PERMISSIONS
  const permsLabel = await page.locator('text=PERMISSIONS').isVisible().catch(() => false);
  console.log('PERMISSIONS label visible:', permsLabel);

  // Check for AGENT
  const agentLabel = await page.locator('text=AGENT').isVisible().catch(() => false);
  console.log('AGENT label visible:', agentLabel);

  // Check for quick start cards
  const quickStart = await page.locator('text=QUICK START').isVisible().catch(() => false);
  console.log('QUICK START visible:', quickStart);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // TEST: Settings - verify workspace section
  console.log('\n=== Verifying Settings Tab ===');
  await page.locator('text=Settings').first().click();
  await page.waitForTimeout(1500);

  const settingsText = await page.evaluate(() => document.body.innerText);
  // Check for specific settings sections
  const hasWorkspace = settingsText.includes('Workspace');
  const hasGeneral = settingsText.includes('General');
  const hasPMO = settingsText.includes('PMO');
  const hasCPU = /CPU|cpu/i.test(settingsText);
  const hasRAM = /RAM|ram|memory/i.test(settingsText);

  console.log('Workspace section:', hasWorkspace);
  console.log('General section:', hasGeneral);
  console.log('PMO Scheduler:', hasPMO);
  console.log('CPU info:', hasCPU);
  console.log('RAM info:', hasRAM);

  // Take a full page screenshot at higher resolution
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-settings-full.png'), fullPage: true });

  // Check keyboard shortcuts section
  const hasShortcuts = settingsText.includes('Shortcut') || settingsText.includes('shortcut') || settingsText.includes('Key');
  console.log('Shortcuts section:', hasShortcuts);

  // Print bottom footer for keyboard shortcut evidence
  const footerText = await page.evaluate(() => {
    const footer = document.querySelector('footer, [class*=footer], [class*=status]');
    return footer ? footer.innerText : 'no footer found';
  });
  console.log('Footer:', footerText);

  await browser.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });

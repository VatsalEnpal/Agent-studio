import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = './test-screenshots/qa-run';
const BASE_URL = 'http://localhost:8080';
const results = [];

function log(test, status, detail) {
  const entry = { test, status, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  console.log(`[${status}] ${test}: ${detail}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), url: page.url() });
    }
  });

  // ========== TEST 1: Homepage Loads ==========
  console.log('\n=== TEST 1: Homepage Loads ===');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-homepage.png'), fullPage: true });

    // Check for white screen (body should have content)
    const bodyText = await page.evaluate(() => document.body.innerText.length);
    if (bodyText < 10) {
      log('Homepage', 'FAIL', 'Page appears blank (body text < 10 chars)');
    } else {
      log('Homepage', 'PASS', `Page loaded with ${bodyText} chars of text`);
    }

    // Check for tab bar / navigation
    const tabTexts = ['Sessions', 'Teams', 'Memory', 'Settings'];
    for (const tab of tabTexts) {
      const found = await page.locator(`text=${tab}`).first().isVisible().catch(() => false);
      log(`Homepage - Tab "${tab}"`, found ? 'PASS' : 'FAIL', found ? 'Visible' : 'Not found on page');
    }

    // Check for sidebar
    const sidebar = await page.locator('[class*=sidebar], aside, nav').first().isVisible().catch(() => false);
    log('Homepage - Sidebar', sidebar ? 'PASS' : 'INFO', sidebar ? 'Sidebar element found' : 'No explicit sidebar element (may be integrated)');

  } catch (e) {
    log('Homepage', 'FAIL', `Error loading: ${e.message}`);
  }

  // ========== TEST 2: Tab Switching ==========
  console.log('\n=== TEST 2: Tab Switching ===');
  const tabs = ['Teams', 'Memory', 'Settings', 'Sessions'];
  for (const tab of tabs) {
    try {
      // Try clicking by exact text, then by partial match
      const tabEl = page.locator(`text=${tab}`).first();
      const visible = await tabEl.isVisible().catch(() => false);
      if (visible) {
        await tabEl.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `02-tab-${tab.toLowerCase()}.png`), fullPage: true });

        // Check page isn't blank after switching
        const bodyText = await page.evaluate(() => document.body.innerText.length);
        if (bodyText < 10) {
          log(`Tab "${tab}"`, 'FAIL', 'Content area blank after switching');
        } else {
          log(`Tab "${tab}"`, 'PASS', `Tab content rendered (${bodyText} chars)`);
        }
      } else {
        log(`Tab "${tab}"`, 'FAIL', 'Tab button not visible/clickable');
      }
    } catch (e) {
      log(`Tab "${tab}"`, 'FAIL', `Error: ${e.message}`);
    }
  }

  // ========== TEST 3: Session Launcher ==========
  console.log('\n=== TEST 3: Session Launcher ===');
  try {
    // Look for New Session button
    const newSessionBtn = page.locator('text=/New Session|\\+ New|Add Session/i').first();
    const btnVisible = await newSessionBtn.isVisible().catch(() => false);

    if (btnVisible) {
      await newSessionBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-session-launcher.png'), fullPage: true });

      // Check for modal/dialog elements
      const modelSelector = await page.locator('text=/opus|sonnet|haiku|model/i').first().isVisible().catch(() => false);
      const agentSelector = await page.locator('text=/agent|orchestrator|frontend|backend/i').first().isVisible().catch(() => false);
      const launchBtn = await page.locator('text=/Launch|Start|Create/i').first().isVisible().catch(() => false);

      log('Session Launcher - Modal', 'PASS', 'Modal/dialog opened');
      log('Session Launcher - Model Selector', modelSelector ? 'PASS' : 'FAIL', modelSelector ? 'Model options found' : 'No model selector visible');
      log('Session Launcher - Agent Selector', agentSelector ? 'PASS' : 'INFO', agentSelector ? 'Agent options found' : 'No agent selector visible');
      log('Session Launcher - Launch Button', launchBtn ? 'PASS' : 'FAIL', launchBtn ? 'Launch button found' : 'No launch button visible');

      // Close modal (press Escape)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      // Try keyboard shortcut
      await page.keyboard.press('n');
      await page.waitForTimeout(500);
      const modalAfterKey = await page.locator('text=/New Session|Launch|model/i').first().isVisible().catch(() => false);
      if (modalAfterKey) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-session-launcher-keyboard.png'), fullPage: true });
        log('Session Launcher', 'PASS', 'Opened via keyboard shortcut');
        await page.keyboard.press('Escape');
      } else {
        log('Session Launcher', 'FAIL', 'Could not find or trigger New Session button');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-session-launcher-missing.png'), fullPage: true });
      }
    }
  } catch (e) {
    log('Session Launcher', 'FAIL', `Error: ${e.message}`);
  }

  // ========== TEST 4: Settings Tab ==========
  console.log('\n=== TEST 4: Settings Tab ===');
  try {
    const settingsTab = page.locator('text=Settings').first();
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-settings.png'), fullPage: true });

    const cpuRam = await page.locator('text=/CPU|RAM|Memory|Disk|System/i').first().isVisible().catch(() => false);
    const workspace = await page.locator('text=/Workspace|Project/i').first().isVisible().catch(() => false);
    const shortcuts = await page.locator('text=/Shortcut|Keyboard|Key/i').first().isVisible().catch(() => false);

    log('Settings - System Monitor', cpuRam ? 'PASS' : 'FAIL', cpuRam ? 'System stats visible' : 'No CPU/RAM/Disk info found');
    log('Settings - Workspace', workspace ? 'PASS' : 'FAIL', workspace ? 'Workspace section found' : 'No workspace section');
    log('Settings - Shortcuts', shortcuts ? 'PASS' : 'INFO', shortcuts ? 'Keyboard shortcuts listed' : 'No shortcuts section found');
  } catch (e) {
    log('Settings Tab', 'FAIL', `Error: ${e.message}`);
  }

  // ========== TEST 5: Memory Tab ==========
  console.log('\n=== TEST 5: Memory Tab ===');
  try {
    const memoryTab = page.locator('text=Memory').first();
    await memoryTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-memory.png'), fullPage: true });

    // Check for entries
    const entryCount = await page.locator('[class*=entry], [class*=card], [class*=item], tr, li').count();
    log('Memory - Entries Loaded', entryCount > 2 ? 'PASS' : 'FAIL', `Found ${entryCount} list/card elements`);

    // Check for search
    const search = await page.locator('input[type=search], input[placeholder*=earch], input[placeholder*=filter]').first().isVisible().catch(() => false);
    log('Memory - Search', search ? 'PASS' : 'FAIL', search ? 'Search input found' : 'No search input');

    // Check for category filter pills
    const pills = await page.locator('text=/pattern|correction|decision|knowledge|learning/i').first().isVisible().catch(() => false);
    log('Memory - Category Filters', pills ? 'PASS' : 'FAIL', pills ? 'Category pills visible' : 'No category filter pills found');
  } catch (e) {
    log('Memory Tab', 'FAIL', `Error: ${e.message}`);
  }

  // ========== TEST 6: Teams Tab ==========
  console.log('\n=== TEST 6: Teams Tab ===');
  try {
    const teamsTab = page.locator('text=Teams').first();
    await teamsTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-teams.png'), fullPage: true });

    const flowSidebar = await page.locator('text=/flow|workflow|sprint|planning/i').first().isVisible().catch(() => false);
    const timeline = await page.locator('text=/step|phase|stage/i').first().isVisible().catch(() => false);

    log('Teams - Flow Sidebar', flowSidebar ? 'PASS' : 'FAIL', flowSidebar ? 'Flow sidebar content found' : 'No flow/workflow content visible');
    log('Teams - Step Timeline', timeline ? 'PASS' : 'INFO', timeline ? 'Step/phase content found' : 'No step timeline visible');
  } catch (e) {
    log('Teams Tab', 'FAIL', `Error: ${e.message}`);
  }

  // ========== TEST 7: Console Errors ==========
  console.log('\n=== TEST 7: Console Errors ===');
  if (consoleErrors.length === 0) {
    log('Console Errors', 'PASS', 'No console errors detected');
  } else {
    for (const err of consoleErrors.slice(0, 10)) {
      log('Console Error', 'FAIL', `"${err.text}" on ${err.url}`);
    }
    if (consoleErrors.length > 10) {
      log('Console Errors', 'FAIL', `${consoleErrors.length - 10} more errors not shown`);
    }
  }

  // ========== SUMMARY ==========
  console.log('\n========== QA SUMMARY ==========');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO').length;
  console.log(`PASS: ${passed} | FAIL: ${failed} | INFO: ${info}`);
  console.log(`Total tests: ${results.length}`);

  // Write results JSON
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'results.json'),
    JSON.stringify({ summary: { passed, failed, info, total: results.length }, results, consoleErrors }, null, 2)
  );

  await browser.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });

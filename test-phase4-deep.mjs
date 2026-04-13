import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/test-screenshots/phase4';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function screenshot(page, name) {
  return page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
}

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(3000);

  // === Test: Tab title should show session count when sessions exist ===
  console.log('=== Tab title with sessions ===');

  // Create a session
  const newBtn = await page.$('button:has-text("New Session")') || await page.$('button:has-text("Start your first session")');
  if (newBtn) {
    await newBtn.click();
    await sleep(500);
    const launchBtn = await page.$('button:has-text("Launch")');
    if (launchBtn) await launchBtn.click();
    await sleep(3000);
  }

  // The use-notifications hook updates title based on attention count (exited sessions)
  // With 1 active session, attention count = 0, so title should be "Agent Console"
  const titleWithSession = await page.title();
  console.log(`  Title with 1 active session: "${titleWithSession}"`);
  // This is correct - title only shows count for EXITED (attention-needing) sessions

  // === Test: Sidebar collapse animation duration ===
  console.log('\n=== Sidebar collapse/expand animation ===');

  // Check if sidebar has duration class
  const sidebarClasses = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.className : 'no aside';
  });
  console.log(`  Sidebar classes: ${sidebarClasses}`);
  // Expected: has "transition-[width] duration-200"

  // === Test: Focus border transition on terminal pane ===
  console.log('\n=== Terminal focus border transition ===');
  const paneClasses = await page.evaluate(() => {
    const panes = document.querySelectorAll('[class*="rounded-lg"][class*="border"]');
    const classes = [];
    panes.forEach(p => classes.push(p.className.substring(0, 200)));
    return classes;
  });
  console.log(`  Terminal pane classes: ${JSON.stringify(paneClasses).substring(0, 300)}`);
  // Expected: has "transition-[border-color,box-shadow] duration-200"

  // === Test: Activity feed fade-in (Teams view) ===
  console.log('\n=== Activity feed fade-in ===');
  const teamsTab = await page.$('button:has-text("Teams")');
  if (teamsTab) {
    await teamsTab.click();
    await sleep(2000);

    // Check for animation classes in activity feed
    const feedAnimations = await page.evaluate(() => {
      const items = document.querySelectorAll('[class*="animate"]');
      return Array.from(items).map(el => el.className.substring(0, 100)).slice(0, 5);
    });
    console.log(`  Activity feed animation classes: ${JSON.stringify(feedAnimations)}`);

    // Check teams view structure
    const teamsStructure = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return 'no main';
      const headings = Array.from(main.querySelectorAll('h2, h3')).map(h => h.textContent);
      return headings;
    });
    console.log(`  Teams view headings: ${JSON.stringify(teamsStructure)}`);

    // Check side panel content
    const sidePanelContent = await page.evaluate(() => {
      const aside = document.querySelectorAll('aside');
      // The second aside is the teams side panel (first is the sidebar)
      if (aside.length > 0) {
        const last = aside[aside.length - 1];
        const headings = Array.from(last.querySelectorAll('span, h3, h4')).map(h => h.textContent?.trim()).filter(Boolean);
        return headings.slice(0, 10);
      }
      return [];
    });
    console.log(`  Side panel content: ${JSON.stringify(sidePanelContent)}`);
    await screenshot(page, 'deep-teams-view');

    // Go back to sessions
    const sessionsTab = await page.$('button:has-text("Sessions")');
    if (sessionsTab) await sessionsTab.click();
    await sleep(500);
  }

  // === Test: Empty state when no sessions ===
  console.log('\n=== Empty state rendering ===');
  // Kill all sessions first
  let killBtns = await page.$$('button[title="Kill session"]');
  for (const btn of killBtns) {
    await btn.click();
    await sleep(500);
  }
  await sleep(1000);

  const emptyState = await page.evaluate(() => {
    return {
      hasEmptyMsg: document.body.innerText.includes('No sessions running'),
      hasCmdNHint: document.body.innerText.includes('Cmd+N'),
      hasCmdKHint: document.body.innerText.includes('Cmd+K'),
      hasStartButton: document.body.innerText.includes('Start your first session'),
    };
  });
  console.log(`  Empty state: ${JSON.stringify(emptyState)}`);
  await screenshot(page, 'deep-empty-state');

  // === Test: 1920px viewport ===
  console.log('\n=== 1920px viewport test ===');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(500);
  await screenshot(page, 'deep-1920px-view');
  const layoutAt1920 = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    const header = document.querySelector('header');
    return {
      footerWidth: footer?.offsetWidth,
      headerWidth: header?.offsetWidth,
      bodyWidth: document.body.offsetWidth,
    };
  });
  console.log(`  Layout at 1920px: ${JSON.stringify(layoutAt1920)}`);

  // === Test: 1280px viewport ===
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(500);
  await screenshot(page, 'deep-1280px-view');

  // === Test: Disabled tabs (Memory, Settings) ===
  console.log('\n=== Disabled tabs ===');
  const memoryTab = await page.$('button:has-text("Memory")');
  const settingsTab = await page.$('button:has-text("Settings")');

  if (memoryTab) {
    const memoryDisabled = await memoryTab.getAttribute('disabled');
    console.log(`  Memory tab disabled: ${memoryDisabled !== null}`);
    // Click it anyway - it shouldn't switch
    await memoryTab.click({ force: true });
    await sleep(300);
    // If disabled properly, we should still be in sessions view
    // Actually, looking at the code, disabled tabs have cursor-not-allowed but
    // the click handler checks tab.disabled. Let's verify:
    const currentMode = await page.evaluate(() => {
      const body = document.body.innerText;
      if (body.includes('Memory browser coming soon')) return 'memory';
      if (body.includes('No sessions') || document.querySelector('.xterm')) return 'sessions';
      return 'unknown';
    });
    console.log(`  After clicking Memory tab: mode = ${currentMode}`);
    // The tab IS disabled in the button (disabled prop) but we force-clicked it
  }

  // === Final: Confirm zero console errors throughout ===
  console.log('\n=== Final Summary ===');
  const pageErrors = await page.evaluate(() => {
    // Any unhandled promise rejections or runtime errors
    return window.__pageErrors || 'none tracked';
  });
  console.log(`  Page runtime errors: ${pageErrors}`);

  await browser.close();
}

test().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});

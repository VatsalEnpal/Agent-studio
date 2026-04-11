import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/agent-console/qa-screenshots/parallel';
const BASE_URL = 'http://localhost:8080';

// Ensure directory exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

interface ConsoleMsg {
  type: string;
  text: string;
}

const consoleErrors: ConsoleMsg[] = [];
const allConsoleLogs: { step: string; messages: ConsoleMsg[] }[] = [];

function screenshot(page: Page, name: string) {
  return page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

async function collectConsole(page: Page, stepName: string) {
  // We'll collect from the page's console event listener
}

test.describe('Agent Studio Full QA', () => {
  let consoleMessages: ConsoleMsg[] = [];

  test.beforeEach(async ({ page }) => {
    consoleMessages = [];
    page.on('console', (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
      if (msg.type() === 'error') {
        consoleErrors.push({ type: msg.type(), text: msg.text() });
      }
    });
  });

  function logConsole(step: string) {
    const errors = consoleMessages.filter(m => m.type === 'error');
    allConsoleLogs.push({ step, messages: [...consoleMessages] });
    consoleMessages.length = 0;
    return errors;
  }

  test('01 - Navigate to homepage', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await screenshot(page, '01_homepage');
    const errors = logConsole('01_homepage');
    // Page should load without critical errors
    const title = await page.title();
    console.log(`Page title: ${title}`);
    // Check the page has content
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('02 - Sessions tab', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Look for Sessions tab/section in sidebar
    const sessionsLink = page.locator('text=Sessions').first();
    if (await sessionsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sessionsLink.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '02_sessions_tab');
    const errors = logConsole('02_sessions');

    // Check if any session items are listed
    const bodyText = await page.textContent('body');
    console.log(`Sessions visible: ${bodyText?.includes('session') || bodyText?.includes('Session')}`);
  });

  test('03 - Click between sessions rapidly', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Find clickable session items
    const sessionItems = page.locator('[data-testid*="session"], [class*="session"], li, [role="option"], [role="listitem"]');
    const count = await sessionItems.count();
    console.log(`Found ${count} potential session items`);

    // If multiple items, click rapidly between them
    if (count >= 2) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const idx = i % Math.min(count, 3);
        try {
          await sessionItems.nth(idx).click({ timeout: 2000 });
          await page.waitForTimeout(200);
        } catch { /* skip */ }
      }
    }
    await page.waitForTimeout(500);
    await screenshot(page, '03_rapid_session_clicks');

    // Check for blank screen
    const body = await page.textContent('body');
    const isBlank = !body || body.trim().length < 10;
    console.log(`Blank screen after rapid clicks: ${isBlank}`);
    logConsole('03_rapid_clicks');
  });

  test('04 - Teams tab with Rooms/Sprints toggle', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Look for Teams tab
    const teamsLink = page.locator('text=Teams').first();
    if (await teamsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await teamsLink.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '04_teams_tab');

    // Look for Rooms/Sprints toggle
    const roomsBtn = page.locator('text=Rooms').first();
    const sprintsBtn = page.locator('text=Sprints').first();
    const hasRooms = await roomsBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const hasSprints = await sprintsBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Rooms toggle: ${hasRooms}, Sprints toggle: ${hasSprints}`);

    if (hasRooms) {
      await roomsBtn.click();
      await page.waitForTimeout(300);
    }
    if (hasSprints) {
      await sprintsBtn.click();
      await page.waitForTimeout(300);
    }
    await screenshot(page, '04_teams_toggle');
    logConsole('04_teams');
  });

  test('05 - Click a room for chat view', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Navigate to Teams
    const teamsLink = page.locator('text=Teams').first();
    if (await teamsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await teamsLink.click();
      await page.waitForTimeout(500);
    }

    // Click Rooms if available
    const roomsBtn = page.locator('text=Rooms').first();
    if (await roomsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roomsBtn.click();
      await page.waitForTimeout(500);
    }

    // Find and click a room item
    // Try various selectors for room items
    const roomSelectors = [
      '[data-testid*="room"]',
      '[class*="room"]',
      '[class*="chat"]',
      'li:has-text("room")',
    ];
    let clicked = false;
    for (const sel of roomSelectors) {
      const items = page.locator(sel);
      if (await items.count() > 0) {
        await items.first().click({ timeout: 2000 }).catch(() => {});
        clicked = true;
        break;
      }
    }

    // Also try clicking any list item that might be a room
    if (!clicked) {
      // Just click the first clickable item in the teams section
      const anyItem = page.locator('main li, main [role="button"], main button').first();
      if (await anyItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await anyItem.click().catch(() => {});
      }
    }

    await page.waitForTimeout(500);
    await screenshot(page, '05_room_chat_view');
    logConsole('05_room_chat');
  });

  test('06 - Memory tab', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const memoryLink = page.locator('text=Memory').first();
    if (await memoryLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await memoryLink.click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, '06_memory_tab');

    const body = await page.textContent('body');
    console.log(`Memory tab has content: ${(body?.length ?? 0) > 50}`);
    logConsole('06_memory');
  });

  test('07 - Settings tab', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const settingsLink = page.locator('text=Settings').first();
    if (await settingsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsLink.click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, '07_settings_tab');

    // Check for settings sections
    const body = await page.textContent('body') ?? '';
    const sections = ['Theme', 'API', 'General', 'Path', 'Config', 'Model', 'Key', 'Server'];
    const foundSections = sections.filter(s => body.toLowerCase().includes(s.toLowerCase()));
    console.log(`Settings sections found: ${foundSections.join(', ')}`);
    logConsole('07_settings');
  });

  test('08 - Session launcher (+ New Session)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Look for + New Session button or similar
    const newSessionSelectors = [
      'text=New Session',
      'text=+ New',
      'button:has-text("New")',
      '[aria-label*="new"]',
      '[aria-label*="New"]',
      'text=Launch',
      '[data-testid*="new-session"]',
      'button:has-text("+")',
    ];

    let found = false;
    for (const sel of newSessionSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click({ timeout: 2000 }).catch(() => {});
        found = true;
        console.log(`Found new session button with selector: ${sel}`);
        break;
      }
    }

    await page.waitForTimeout(500);
    await screenshot(page, '08_session_launcher');

    // Check for agent dropdown default
    const body = await page.textContent('body') ?? '';
    const hasAgentNone = body.includes('none') || body.includes('None') || body.includes('Select');
    console.log(`Agent default appears to be none/select: ${hasAgentNone}`);
    logConsole('08_launcher');
  });

  test('09 - Help panel (? icon)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Look for help/? button
    const helpSelectors = [
      'text=?',
      '[aria-label*="help"]',
      '[aria-label*="Help"]',
      'button:has-text("?")',
      '[data-testid*="help"]',
      '[title*="help"]',
      '[title*="Help"]',
      'svg[class*="help"]',
    ];

    let found = false;
    for (const sel of helpSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click({ timeout: 2000 }).catch(() => {});
        found = true;
        console.log(`Found help button with selector: ${sel}`);
        break;
      }
    }

    // Also try keyboard shortcut
    if (!found) {
      await page.keyboard.press('?');
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(500);
    await screenshot(page, '09_help_panel');

    const body = await page.textContent('body') ?? '';
    const hasShortcuts = body.includes('shortcut') || body.includes('Shortcut') || body.includes('Ctrl') || body.includes('Cmd') || body.includes('keyboard');
    console.log(`Help panel shows shortcuts: ${hasShortcuts}`);
    logConsole('09_help');
  });

  test('10 - Theme toggle (light/dark)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Screenshot current theme
    await screenshot(page, '10_theme_before');

    // Look for theme toggle
    const themeSelectors = [
      '[aria-label*="theme"]',
      '[aria-label*="Theme"]',
      '[aria-label*="dark"]',
      '[aria-label*="light"]',
      '[aria-label*="mode"]',
      '[data-testid*="theme"]',
      'button:has(svg[class*="sun"])',
      'button:has(svg[class*="moon"])',
      '[title*="theme"]',
      '[title*="Theme"]',
    ];

    let found = false;
    for (const sel of themeSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click({ timeout: 2000 }).catch(() => {});
        found = true;
        console.log(`Found theme toggle with selector: ${sel}`);
        break;
      }
    }

    // If no dedicated button, check Settings for theme option
    if (!found) {
      const settingsLink = page.locator('text=Settings').first();
      if (await settingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsLink.click();
        await page.waitForTimeout(500);
        const themeBtn = page.locator('text=Dark, text=Light, text=Theme').first();
        if (await themeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await themeBtn.click().catch(() => {});
          found = true;
        }
      }
    }

    await page.waitForTimeout(500);
    await screenshot(page, '10_theme_after');

    // Check if html class changed
    const htmlClass = await page.locator('html').getAttribute('class') ?? '';
    const bodyClass = await page.locator('body').getAttribute('class') ?? '';
    console.log(`HTML class: ${htmlClass}, Body class: ${bodyClass.substring(0, 100)}`);
    logConsole('10_theme');
  });

  test('11 - Sidebar sections', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const body = await page.textContent('body') ?? '';
    const expectedSections = ['Sessions', 'Servers', 'Running', 'Recent', 'Repos'];
    const results: Record<string, boolean> = {};
    for (const section of expectedSections) {
      results[section] = body.includes(section);
    }
    console.log('Sidebar sections:', JSON.stringify(results));
    await screenshot(page, '11_sidebar_sections');
    logConsole('11_sidebar');
  });

  test('12 - Console errors summary', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Navigate through all tabs to collect errors
    const tabs = ['Sessions', 'Teams', 'Memory', 'Settings'];
    for (const tab of tabs) {
      const link = page.locator(`text=${tab}`).first();
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        await link.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    const errors = consoleMessages.filter(m => m.type === 'error');
    console.log(`Total console errors: ${errors.length}`);
    for (const e of errors) {
      console.log(`  ERROR: ${e.text.substring(0, 200)}`);
    }
    await screenshot(page, '12_final_state');
    logConsole('12_console_summary');
  });
});

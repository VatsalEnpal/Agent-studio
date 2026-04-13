import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/agent-console/qa-screenshots';
const BASE_URL = 'http://localhost:9090';

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`SCREENSHOT: ${p}`);
  return p;
}

async function getConsoleErrors(page) {
  // We'll collect from now on
  return page.__consoleErrors || [];
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Collect console errors
  page.__consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      page.__consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    page.__consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  const results = [];

  // ========== TEST 1: Homepage ==========
  console.log('\n=== TEST 1: Homepage ===');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000); // let React render
    await screenshot(page, '01_homepage');

    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Check for setup wizard
    const bodyText = await page.textContent('body');
    const hasSetupWizard = bodyText.includes('Setup') || bodyText.includes('setup') || bodyText.includes('Welcome') || bodyText.includes('Get Started');
    const isWhiteScreen = bodyText.trim().length < 10;

    console.log(`Body text length: ${bodyText.trim().length}`);
    console.log(`Has setup wizard indicators: ${hasSetupWizard}`);
    console.log(`Is white screen: ${isWhiteScreen}`);

    if (isWhiteScreen) {
      results.push({ test: 'Homepage', status: 'FAIL', detail: 'White screen - no content rendered' });
    } else if (hasSetupWizard) {
      results.push({ test: 'Homepage', status: 'PASS', detail: 'Setup wizard detected' });
    } else {
      results.push({ test: 'Homepage', status: 'INFO', detail: `No setup wizard found. Page content starts with: "${bodyText.trim().substring(0, 200)}"` });
    }

    // Check for quick start or empty state
    const hasQuickStart = bodyText.includes('Quick') || bodyText.includes('New Session') || bodyText.includes('Create');
    console.log(`Has quick start elements: ${hasQuickStart}`);

  } catch (e) {
    results.push({ test: 'Homepage', status: 'FAIL', detail: `Error: ${e.message}` });
    await screenshot(page, '01_homepage_error');
  }

  // ========== TEST 2: Check empty state / what's visible ==========
  console.log('\n=== TEST 2: Empty State ===');
  try {
    const allButtons = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t.length > 0));
    console.log(`Buttons found: ${JSON.stringify(allButtons.slice(0, 20))}`);

    const allLinks = await page.$$eval('a', links => links.map(l => ({ text: l.textContent.trim(), href: l.getAttribute('href') })).filter(l => l.text.length > 0));
    console.log(`Links found: ${JSON.stringify(allLinks.slice(0, 20))}`);

    // Check for any modals/dialogs
    const dialogs = await page.$$('[role="dialog"], [role="alertdialog"], .modal, [data-state="open"]');
    console.log(`Dialogs/modals found: ${dialogs.length}`);

    results.push({ test: 'Empty State', status: 'INFO', detail: `${allButtons.length} buttons, ${allLinks.length} links, ${dialogs.length} dialogs` });
  } catch (e) {
    results.push({ test: 'Empty State', status: 'FAIL', detail: `Error: ${e.message}` });
  }

  // ========== TEST 3: Tab Switching ==========
  console.log('\n=== TEST 3: Tab Switching ===');
  const tabs = ['Sessions', 'Teams', 'Memory', 'Settings'];

  for (const tab of tabs) {
    try {
      // Try clicking tab by text
      const tabBtn = await page.$(`text="${tab}"`);
      if (tabBtn) {
        await tabBtn.click();
        await page.waitForTimeout(1500);
        await screenshot(page, `03_tab_${tab.toLowerCase()}`);

        const bodyText = await page.textContent('body');
        const isWhiteScreen = bodyText.trim().length < 10;
        const hasError = bodyText.includes('Error') || bodyText.includes('error') || bodyText.includes('Something went wrong');

        console.log(`Tab "${tab}": loaded, content length=${bodyText.trim().length}, hasError=${hasError}`);

        if (isWhiteScreen) {
          results.push({ test: `Tab: ${tab}`, status: 'FAIL', detail: 'White screen after clicking tab' });
        } else if (hasError && !bodyText.includes('No errors')) {
          results.push({ test: `Tab: ${tab}`, status: 'WARN', detail: 'Possible error state displayed' });
        } else {
          results.push({ test: `Tab: ${tab}`, status: 'PASS', detail: 'Tab renders without crash' });
        }
      } else {
        // Try finding it by aria-label or role
        const altTab = await page.$(`[aria-label="${tab}"], button:has-text("${tab}"), a:has-text("${tab}"), [data-tab="${tab.toLowerCase()}"]`);
        if (altTab) {
          await altTab.click();
          await page.waitForTimeout(1500);
          await screenshot(page, `03_tab_${tab.toLowerCase()}`);
          results.push({ test: `Tab: ${tab}`, status: 'PASS', detail: 'Tab found via alt selector and renders' });
        } else {
          console.log(`Tab "${tab}": NOT FOUND in UI`);
          results.push({ test: `Tab: ${tab}`, status: 'SKIP', detail: 'Tab button not found in UI' });
        }
      }
    } catch (e) {
      results.push({ test: `Tab: ${tab}`, status: 'FAIL', detail: `Error: ${e.message}` });
      await screenshot(page, `03_tab_${tab.toLowerCase()}_error`);
    }
  }

  // ========== TEST 4: New Session Modal ==========
  console.log('\n=== TEST 4: New Session Modal ===');
  try {
    // Try to find "New Session" button
    const newSessionBtn = await page.$('button:has-text("New Session"), button:has-text("new session"), button:has-text("+ New"), [aria-label*="new session" i]');
    if (newSessionBtn) {
      await newSessionBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '04_new_session_modal');

      // Check for modal content
      const dialog = await page.$('[role="dialog"], .modal, [data-state="open"]');
      if (dialog) {
        const dialogText = await dialog.textContent();
        console.log(`Modal content preview: ${dialogText.substring(0, 300)}`);
        results.push({ test: 'New Session Modal', status: 'PASS', detail: 'Modal opens and renders content' });
      } else {
        const bodyText = await page.textContent('body');
        console.log(`No dialog found. Body content: ${bodyText.substring(0, 300)}`);
        results.push({ test: 'New Session Modal', status: 'WARN', detail: 'Button clicked but no dialog element found' });
      }

      // Try to close modal
      const closeBtn = await page.$('button:has-text("Cancel"), button:has-text("Close"), button[aria-label="Close"], [data-dismiss]');
      if (closeBtn) await closeBtn.click();
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

    } else {
      console.log('New Session button NOT FOUND');
      // Check if there's a + button or FAB
      const plusBtn = await page.$('button:has-text("+"), [aria-label*="create" i], [aria-label*="add" i]');
      if (plusBtn) {
        await plusBtn.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '04_new_session_alt');
        results.push({ test: 'New Session Modal', status: 'INFO', detail: 'Found alternative create button' });
      } else {
        results.push({ test: 'New Session Modal', status: 'SKIP', detail: 'No "New Session" or create button found' });
      }
    }
  } catch (e) {
    results.push({ test: 'New Session Modal', status: 'FAIL', detail: `Error: ${e.message}` });
    await screenshot(page, '04_new_session_error');
  }

  // ========== TEST 5: Settings Tab ==========
  console.log('\n=== TEST 5: Settings Tab (detailed) ===');
  try {
    const settingsBtn = await page.$('text="Settings"');
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '05_settings_detail');

      const bodyText = await page.textContent('body');

      // Check for system monitor
      const hasSystemMonitor = bodyText.includes('System') || bodyText.includes('Docker') || bodyText.includes('Container') || bodyText.includes('CPU') || bodyText.includes('Memory');
      console.log(`Has system monitor indicators: ${hasSystemMonitor}`);

      // Check for workspace section
      const hasWorkspace = bodyText.includes('Workspace') || bodyText.includes('workspace') || bodyText.includes('Project');
      console.log(`Has workspace section: ${hasWorkspace}`);

      // Check for Create Agent System button
      const hasCreateAgent = bodyText.includes('Create Agent') || bodyText.includes('Agent System') || bodyText.includes('Initialize');
      console.log(`Has create agent system: ${hasCreateAgent}`);

      results.push({
        test: 'Settings Detail',
        status: 'PASS',
        detail: `System monitor: ${hasSystemMonitor}, Workspace: ${hasWorkspace}, Create Agent: ${hasCreateAgent}`
      });
    } else {
      results.push({ test: 'Settings Detail', status: 'SKIP', detail: 'Settings tab not found' });
    }
  } catch (e) {
    results.push({ test: 'Settings Detail', status: 'FAIL', detail: `Error: ${e.message}` });
  }

  // ========== TEST 6: Console Errors ==========
  console.log('\n=== TEST 6: Console Errors ===');
  const errors = page.__consoleErrors;
  console.log(`Total console errors: ${errors.length}`);
  if (errors.length > 0) {
    errors.forEach((e, i) => console.log(`  Error ${i + 1}: ${e.substring(0, 200)}`));
    results.push({ test: 'Console Errors', status: 'WARN', detail: `${errors.length} console errors found` });
  } else {
    results.push({ test: 'Console Errors', status: 'PASS', detail: 'No console errors' });
  }

  // ========== SUMMARY ==========
  console.log('\n\n========== TEST RESULTS SUMMARY ==========');
  let passCount = 0, failCount = 0, warnCount = 0, skipCount = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : r.status === 'WARN' ? '[WARN]' : r.status === 'SKIP' ? '[SKIP]' : '[INFO]';
    console.log(`${icon} ${r.test}: ${r.detail}`);
    if (r.status === 'PASS') passCount++;
    else if (r.status === 'FAIL') failCount++;
    else if (r.status === 'WARN') warnCount++;
    else if (r.status === 'SKIP') skipCount++;
  }
  console.log(`\nTotals: ${passCount} PASS, ${failCount} FAIL, ${warnCount} WARN, ${skipCount} SKIP`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);

  // Write results JSON
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'results.json'), JSON.stringify(results, null, 2));

  await browser.close();
})();

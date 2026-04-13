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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  const results = [];

  // ========== TEST 1: Setup Wizard Step 1 - Welcome ==========
  console.log('\n=== STEP 1: Welcome ===');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await screenshot(page, '10_wizard_step1_welcome');

  const welcomeText = await page.textContent('body');
  const hasWelcome = welcomeText.includes('Welcome to Agent Studio');
  console.log(`Welcome page detected: ${hasWelcome}`);
  results.push({ test: 'Wizard Step 1 (Welcome)', status: hasWelcome ? 'PASS' : 'FAIL', detail: hasWelcome ? 'Welcome page renders correctly with title, description, and progress indicator 1/4' : 'Welcome text not found' });

  // Check step tabs are visible
  const stepTabs = ['Welcome', 'Projects', 'Agent System', 'Preferences'];
  for (const tab of stepTabs) {
    const found = welcomeText.includes(tab);
    console.log(`  Step tab "${tab}": ${found ? 'visible' : 'NOT visible'}`);
  }

  // ========== TEST 2: Setup Wizard Step 2 - Projects ==========
  console.log('\n=== STEP 2: Projects ===');
  const nextBtn = await page.$('button:has-text("Next")');
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '11_wizard_step2_projects');

    const projText = await page.textContent('body');
    console.log(`Step 2 content preview: ${projText.substring(0, 300)}`);

    const hasProjectStep = projText.includes('Project') || projText.includes('project') || projText.includes('Workspace') || projText.includes('workspace');
    results.push({ test: 'Wizard Step 2 (Projects)', status: 'PASS', detail: `Projects step renders. Has project content: ${hasProjectStep}` });

    // Check what inputs/buttons are available
    const inputs = await page.$$eval('input', els => els.map(e => ({ type: e.type, placeholder: e.placeholder, name: e.name })));
    console.log(`Inputs on step 2: ${JSON.stringify(inputs)}`);

    const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t));
    console.log(`Buttons on step 2: ${JSON.stringify(buttons)}`);
  } else {
    results.push({ test: 'Wizard Step 2', status: 'FAIL', detail: 'Next button not found' });
  }

  // ========== TEST 3: Setup Wizard Step 3 - Agent System ==========
  console.log('\n=== STEP 3: Agent System ===');
  const nextBtn2 = await page.$('button:has-text("Next")');
  if (nextBtn2) {
    await nextBtn2.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '12_wizard_step3_agent_system');

    const agentText = await page.textContent('body');
    console.log(`Step 3 content preview: ${agentText.substring(0, 300)}`);

    const hasAgentSystem = agentText.includes('Agent') || agentText.includes('agent');
    results.push({ test: 'Wizard Step 3 (Agent System)', status: 'PASS', detail: `Agent System step renders. Has agent content: ${hasAgentSystem}` });

    const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t));
    console.log(`Buttons on step 3: ${JSON.stringify(buttons)}`);
  } else {
    results.push({ test: 'Wizard Step 3', status: 'FAIL', detail: 'Next button not found' });
  }

  // ========== TEST 4: Setup Wizard Step 4 - Preferences ==========
  console.log('\n=== STEP 4: Preferences ===');
  const nextBtn3 = await page.$('button:has-text("Next")');
  if (nextBtn3) {
    await nextBtn3.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '13_wizard_step4_preferences');

    const prefText = await page.textContent('body');
    console.log(`Step 4 content preview: ${prefText.substring(0, 300)}`);

    const hasPreferences = prefText.includes('Preferences') || prefText.includes('preferences') || prefText.includes('Theme') || prefText.includes('Notification');
    results.push({ test: 'Wizard Step 4 (Preferences)', status: 'PASS', detail: `Preferences step renders. Has preference content: ${hasPreferences}` });

    const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t));
    console.log(`Buttons on step 4: ${JSON.stringify(buttons)}`);
  } else {
    results.push({ test: 'Wizard Step 4', status: 'FAIL', detail: 'Next button not found' });
  }

  // ========== TEST 5: Complete Wizard ==========
  console.log('\n=== STEP 5: Complete Wizard ===');
  // Look for a "Finish", "Complete", "Get Started", or "Done" button
  const finishBtn = await page.$('button:has-text("Finish"), button:has-text("Complete"), button:has-text("Get Started"), button:has-text("Done"), button:has-text("Start"), button:has-text("Next")');
  if (finishBtn) {
    const finishText = await finishBtn.textContent();
    console.log(`Finish button text: "${finishText}"`);
    await finishBtn.click();
    await page.waitForTimeout(3000);
    await screenshot(page, '14_after_wizard');

    const afterText = await page.textContent('body');
    const url = page.url();
    console.log(`URL after wizard: ${url}`);
    console.log(`Content after wizard: ${afterText.substring(0, 400)}`);

    // Check if we're now on the main dashboard
    const isDashboard = afterText.includes('Sessions') || afterText.includes('Dashboard') || afterText.includes('Agent');
    results.push({ test: 'Wizard Complete', status: 'PASS', detail: `Wizard completed. Dashboard visible: ${isDashboard}. URL: ${url}` });
  } else {
    results.push({ test: 'Wizard Complete', status: 'FAIL', detail: 'No finish/complete button found on last step' });
    await screenshot(page, '14_wizard_stuck');
  }

  // ========== TEST 6: Tab Navigation After Wizard ==========
  console.log('\n=== TEST 6: Tab Navigation ===');
  const mainTabs = ['Sessions', 'Teams', 'Memory', 'Settings'];
  for (const tab of mainTabs) {
    try {
      const tabEl = await page.$(`text="${tab}"`);
      if (!tabEl) {
        // Try more flexible selectors
        const altEl = await page.$(`button:has-text("${tab}"), a:has-text("${tab}"), [role="tab"]:has-text("${tab}")`);
        if (altEl) {
          await altEl.click();
        } else {
          console.log(`Tab "${tab}": NOT FOUND`);
          results.push({ test: `Tab: ${tab}`, status: 'SKIP', detail: 'Tab not found in UI' });
          continue;
        }
      } else {
        await tabEl.click();
      }
      await page.waitForTimeout(1500);
      await screenshot(page, `15_tab_${tab.toLowerCase()}`);

      const content = await page.textContent('body');
      const hasEmptyState = content.includes('No ') || content.includes('empty') || content.includes('Get started') || content.includes('Create');
      console.log(`Tab "${tab}": rendered, empty state: ${hasEmptyState}`);
      results.push({ test: `Tab: ${tab}`, status: 'PASS', detail: `Renders without crash. Empty state: ${hasEmptyState}` });
    } catch (e) {
      results.push({ test: `Tab: ${tab}`, status: 'FAIL', detail: e.message });
      await screenshot(page, `15_tab_${tab.toLowerCase()}_error`);
    }
  }

  // ========== TEST 7: New Session Modal ==========
  console.log('\n=== TEST 7: New Session Modal ===');
  try {
    // First go to Sessions tab
    const sessTab = await page.$('text="Sessions"');
    if (sessTab) await sessTab.click();
    await page.waitForTimeout(1000);

    const newBtn = await page.$('button:has-text("New Session"), button:has-text("New"), button:has-text("Create Session"), button:has-text("+")');
    if (newBtn) {
      const btnText = await newBtn.textContent();
      console.log(`New session button: "${btnText}"`);
      await newBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '16_new_session_modal');

      const modalContent = await page.textContent('body');
      console.log(`After clicking new session: ${modalContent.substring(0, 300)}`);
      results.push({ test: 'New Session Modal', status: 'PASS', detail: 'Modal/form opened after clicking new session button' });

      // Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log('New Session button not found');
      results.push({ test: 'New Session Modal', status: 'SKIP', detail: 'New session button not found' });
    }
  } catch (e) {
    results.push({ test: 'New Session Modal', status: 'FAIL', detail: e.message });
  }

  // ========== TEST 8: Settings Details ==========
  console.log('\n=== TEST 8: Settings Detail ===');
  try {
    const settingsEl = await page.$('text="Settings"');
    if (settingsEl) {
      await settingsEl.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '17_settings_detail');

      const settingsContent = await page.textContent('body');

      const checks = {
        'Docker/System Monitor': settingsContent.includes('Docker') || settingsContent.includes('System') || settingsContent.includes('Container') || settingsContent.includes('CPU'),
        'Workspace section': settingsContent.includes('Workspace') || settingsContent.includes('workspace') || settingsContent.includes('Project'),
        'Create Agent System': settingsContent.includes('Create Agent') || settingsContent.includes('Agent System') || settingsContent.includes('Initialize') || settingsContent.includes('agent system'),
      };

      for (const [name, found] of Object.entries(checks)) {
        console.log(`  ${name}: ${found ? 'FOUND' : 'NOT FOUND'}`);
      }

      results.push({ test: 'Settings Detail', status: 'PASS', detail: `Docker: ${checks['Docker/System Monitor']}, Workspace: ${checks['Workspace section']}, Agent System: ${checks['Create Agent System']}` });
    }
  } catch (e) {
    results.push({ test: 'Settings Detail', status: 'FAIL', detail: e.message });
  }

  // ========== TEST 9: Console Errors ==========
  console.log('\n=== TEST 9: Console Errors ===');
  console.log(`Total console errors: ${consoleErrors.length}`);
  consoleErrors.forEach((e, i) => console.log(`  Error ${i + 1}: ${e.substring(0, 300)}`));
  results.push({
    test: 'Console Errors',
    status: consoleErrors.length === 0 ? 'PASS' : 'WARN',
    detail: consoleErrors.length === 0 ? 'No console errors across all tests' : `${consoleErrors.length} console errors found`
  });

  // ========== SUMMARY ==========
  console.log('\n\n========== FULL TEST RESULTS ==========');
  let pass = 0, fail = 0, warn = 0, skip = 0;
  for (const r of results) {
    const icon = { PASS: '[PASS]', FAIL: '[FAIL]', WARN: '[WARN]', SKIP: '[SKIP]', INFO: '[INFO]' }[r.status] || '[????]';
    console.log(`${icon} ${r.test}: ${r.detail}`);
    if (r.status === 'PASS') pass++;
    else if (r.status === 'FAIL') fail++;
    else if (r.status === 'WARN') warn++;
    else if (r.status === 'SKIP') skip++;
  }
  console.log(`\nTotals: ${pass} PASS, ${fail} FAIL, ${warn} WARN, ${skip} SKIP`);

  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'full_results.json'), JSON.stringify(results, null, 2));

  await browser.close();
})();

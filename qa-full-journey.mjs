import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:8080';
const SCREENSHOTS = '/Users/vatsalbhatt230813/Code/InPipeline/agent-console/qa-screenshots';
const bugs = [];
const consoleErrors = [];

function bug(severity, title, details) {
  bugs.push({ severity, title, details });
  console.log(`[BUG ${severity}] ${title}: ${details}`);
}

async function screenshot(page, name, step) {
  const path = `${SCREENSHOTS}/${step.toString().padStart(2,'0')}_${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`[SCREENSHOT] ${path}`);
  return path;
}

async function checkConsole(page, context) {
  // We collect console errors via the listener below
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('DevTools')) {
        consoleErrors.push({ context: page.url(), message: text });
      }
    }
  });

  // ========== PHASE 1: SETUP WIZARD ==========
  console.log('\n=== PHASE 1: SETUP WIZARD ===');

  // Step 1: Navigate to home - setup wizard should appear
  console.log('\nStep 1: Navigate to http://localhost:8080');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await screenshot(page, 'initial_load', 1);

  // Check what's on the page
  const bodyText = await page.textContent('body');
  console.log('Page text (first 500 chars):', bodyText?.substring(0, 500));

  // Check if setup wizard is visible
  const hasWizard = bodyText?.includes('Welcome') || bodyText?.includes('Setup') || bodyText?.includes('Get Started');
  console.log('Setup wizard visible:', hasWizard);
  if (!hasWizard) {
    bug('P1', 'Setup wizard may not appear', `Page content doesn't clearly show setup wizard. Text: ${bodyText?.substring(0, 200)}`);
  }

  // Step 2: Screenshot the welcome step
  console.log('\nStep 2: Welcome step');
  await screenshot(page, 'welcome_step', 2);

  // Look for Next button and click it
  const nextBtn = page.locator('button:has-text("Next"), button:has-text("next"), button:has-text("Continue"), button:has-text("Get Started")');
  const nextCount = await nextBtn.count();
  console.log('Next/Continue buttons found:', nextCount);

  if (nextCount > 0) {
    await nextBtn.first().click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'after_welcome_next', 3);
  } else {
    bug('P1', 'No Next button on welcome step', 'Could not find Next/Continue/Get Started button');
    // Try clicking any prominent button
    const anyButton = page.locator('button').first();
    if (await anyButton.count() > 0) {
      const btnText = await anyButton.textContent();
      console.log('First button text:', btnText);
    }
  }

  // Step 3: Projects step - add path
  console.log('\nStep 3: Projects step - add /tmp/fittrack-app');
  await page.waitForTimeout(500);
  const currentText = await page.textContent('body');
  console.log('Current page text (first 300):', currentText?.substring(0, 300));
  await screenshot(page, 'projects_step', 4);

  // Find input field for project path
  const pathInput = page.locator('input[type="text"], input[placeholder*="path"], input[placeholder*="Path"], input[placeholder*="project"], input[placeholder*="directory"]');
  const pathInputCount = await pathInput.count();
  console.log('Path inputs found:', pathInputCount);

  if (pathInputCount > 0) {
    await pathInput.first().fill('/tmp/fittrack-app');
    await page.waitForTimeout(500);

    // Look for Add button
    const addBtn = page.locator('button:has-text("Add"), button:has-text("add"), button[type="submit"]');
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
      await page.waitForTimeout(1000);
    } else {
      // Try pressing Enter
      await pathInput.first().press('Enter');
      await page.waitForTimeout(1000);
    }
    await screenshot(page, 'after_project_added', 5);
  } else {
    bug('P1', 'No project path input found', 'Projects step has no text input for path');
  }

  // Click Next to go to Agent System step
  const nextBtn2 = page.locator('button:has-text("Next"), button:has-text("Continue")');
  if (await nextBtn2.count() > 0) {
    await nextBtn2.first().click();
    await page.waitForTimeout(1000);
  }

  // Step 4: Agent System step
  console.log('\nStep 4: Agent System step');
  await screenshot(page, 'agent_system_step', 6);
  const agentText = await page.textContent('body');
  console.log('Agent system text (first 300):', agentText?.substring(0, 300));

  // Look for "Create a new one" or similar option
  const createNewBtn = page.locator('button:has-text("Create"), button:has-text("create"), label:has-text("Create"), div:has-text("Create a new one")');
  const createCount = await createNewBtn.count();
  console.log('Create new buttons found:', createCount);

  if (createCount > 0) {
    await createNewBtn.first().click();
    await page.waitForTimeout(500);
    await screenshot(page, 'agent_system_create_selected', 7);
  }

  // Click Next
  const nextBtn3 = page.locator('button:has-text("Next"), button:has-text("Continue")');
  if (await nextBtn3.count() > 0) {
    await nextBtn3.first().click();
    await page.waitForTimeout(1000);
  }

  // Step 5: Preferences step
  console.log('\nStep 5: Preferences step');
  await screenshot(page, 'preferences_step', 8);
  const prefText = await page.textContent('body');
  console.log('Preferences text (first 300):', prefText?.substring(0, 300));

  // Look for model selector
  const modelSelect = page.locator('select, [role="combobox"], [role="listbox"], button:has-text("sonnet"), button:has-text("Sonnet"), button:has-text("Model")');
  if (await modelSelect.count() > 0) {
    console.log('Model selector found');
    // Try to select sonnet
    const selectEl = page.locator('select').first();
    if (await selectEl.count() > 0) {
      const options = await selectEl.locator('option').allTextContents();
      console.log('Select options:', options);
      try {
        await selectEl.selectOption({ label: 'sonnet' });
      } catch {
        try {
          await selectEl.selectOption({ value: 'sonnet' });
        } catch {
          console.log('Could not select sonnet from dropdown');
        }
      }
    }
  }

  // Look for Finish button
  const finishBtn = page.locator('button:has-text("Finish"), button:has-text("Complete"), button:has-text("Done"), button:has-text("Save")');
  const finishCount = await finishBtn.count();
  console.log('Finish buttons found:', finishCount);

  if (finishCount > 0) {
    await finishBtn.first().click();
    await page.waitForTimeout(2000);
  } else {
    // Try Next if no Finish
    const nextBtn4 = page.locator('button:has-text("Next")');
    if (await nextBtn4.count() > 0) {
      await nextBtn4.first().click();
      await page.waitForTimeout(2000);
    }
  }

  // Step 6: Main dashboard after wizard
  console.log('\nStep 6: Main dashboard');
  await screenshot(page, 'main_dashboard', 9);
  const dashText = await page.textContent('body');
  console.log('Dashboard text (first 500):', dashText?.substring(0, 500));

  // ========== PHASE 2: VERIFY SETUP ==========
  console.log('\n=== PHASE 2: VERIFY SETUP ===');

  // Step 7: Check API config
  console.log('\nStep 7: Check /api/config');
  const configResp = await page.evaluate(async () => {
    const r = await fetch('/api/config');
    return { status: r.status, body: await r.json() };
  });
  console.log('Config API:', JSON.stringify(configResp, null, 2));

  const hasProject = JSON.stringify(configResp).includes('fittrack');
  console.log('fittrack-app in projects:', hasProject);
  if (!hasProject) {
    bug('P1', 'Project not saved after wizard', 'fittrack-app not found in /api/config after completing setup wizard');
  }

  // Step 8: Check agents API
  console.log('\nStep 8: Check /api/agents');
  const agentsResp = await page.evaluate(async () => {
    const r = await fetch('/api/agents');
    return { status: r.status, body: await r.json() };
  });
  console.log('Agents API:', JSON.stringify(agentsResp, null, 2));

  // Step 9: Screenshot sidebar
  console.log('\nStep 9: Screenshot sidebar');
  await screenshot(page, 'sidebar_check', 10);

  // ========== PHASE 3: DASHBOARD EXPLORATION ==========
  console.log('\n=== PHASE 3: DASHBOARD EXPLORATION ===');

  // Step 10: Click each tab
  const tabs = ['Sessions', 'Teams', 'Memory', 'Reports', 'Settings'];
  let tabIndex = 11;

  for (const tab of tabs) {
    console.log(`\nStep 10: Click ${tab} tab`);
    const tabBtn = page.locator(`button:has-text("${tab}"), a:has-text("${tab}"), [role="tab"]:has-text("${tab}"), nav >> text="${tab}"`);
    if (await tabBtn.count() > 0) {
      await tabBtn.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, `tab_${tab.toLowerCase()}`, tabIndex);
      console.log(`${tab} tab: visible`);
    } else {
      console.log(`${tab} tab: NOT FOUND`);
      bug('P2', `${tab} tab not found`, `Could not find tab/link for ${tab}`);
    }
    tabIndex++;
  }

  // Step 11: Settings - Automations section
  console.log('\nStep 11: Settings - Automations');
  const settingsTab = page.locator('button:has-text("Settings"), a:has-text("Settings"), nav >> text="Settings"');
  if (await settingsTab.count() > 0) {
    await settingsTab.first().click();
    await page.waitForTimeout(1000);
  }

  // Scroll down to find Automations
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await screenshot(page, 'settings_automations', tabIndex);
  tabIndex++;

  const hasAutomations = (await page.textContent('body'))?.includes('Automation');
  console.log('Automations section found:', hasAutomations);

  // Step 12: Session launcher
  console.log('\nStep 12: Session launcher');
  const newSessionBtn = page.locator('button:has-text("New Session"), button:has-text("+ New"), button:has-text("Launch"), button:has-text("new session")');
  if (await newSessionBtn.count() > 0) {
    await newSessionBtn.first().click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'session_launcher', tabIndex);
    tabIndex++;
  } else {
    // Try looking for a + button
    const plusBtn = page.locator('button:has-text("+")');
    if (await plusBtn.count() > 0) {
      console.log('Found + button, clicking');
      await plusBtn.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, 'session_launcher', tabIndex);
      tabIndex++;
    } else {
      bug('P2', 'Session launcher button not found', 'No + New Session button visible');
      await screenshot(page, 'no_session_launcher', tabIndex);
      tabIndex++;
    }
  }

  // ========== PHASE 4: AUTOMATION CONFIGURATION ==========
  console.log('\n=== PHASE 4: AUTOMATION CONFIGURATION ===');

  // Step 13: Go back to Settings, find automations
  console.log('\nStep 13: Add automation');
  // Navigate to settings
  const settingsNav = page.locator('button:has-text("Settings"), a:has-text("Settings"), nav >> text="Settings"');
  if (await settingsNav.count() > 0) {
    await settingsNav.first().click();
    await page.waitForTimeout(1000);
  }

  // Look for Add Automation button
  const addAutoBtn = page.locator('button:has-text("Add Automation"), button:has-text("New Automation"), button:has-text("Create Automation"), button:has-text("+ Add")');
  if (await addAutoBtn.count() > 0) {
    await addAutoBtn.first().click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'add_automation_dialog', tabIndex);
    tabIndex++;

    // Look for template options
    const codeHealth = page.locator('text="Code Health", button:has-text("Code Health"), div:has-text("Code Health")');
    const secScanner = page.locator('text="Security Scanner", button:has-text("Security"), div:has-text("Security")');
    if (await codeHealth.count() > 0) {
      await codeHealth.first().click();
      await page.waitForTimeout(500);
    } else if (await secScanner.count() > 0) {
      await secScanner.first().click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, 'automation_template_selected', tabIndex);
    tabIndex++;
  } else {
    bug('P2', 'No Add Automation button', 'Settings page has no button to add automations');
    await screenshot(page, 'settings_no_add_auto', tabIndex);
    tabIndex++;
  }

  // Step 14: Check automations API
  console.log('\nStep 14: Check /api/automations');
  const autoResp = await page.evaluate(async () => {
    const r = await fetch('/api/automations');
    return { status: r.status, body: await r.json() };
  });
  console.log('Automations API:', JSON.stringify(autoResp, null, 2));

  // Step 15: Try Run Now
  console.log('\nStep 15: Run Now button');
  const runNowBtn = page.locator('button:has-text("Run Now"), button:has-text("Run now"), button:has-text("Execute")');
  if (await runNowBtn.count() > 0) {
    await runNowBtn.first().click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'run_now_result', tabIndex);
    tabIndex++;
  } else {
    console.log('No Run Now button found');
  }

  // ========== PHASE 5: REPORTS TAB ==========
  console.log('\n=== PHASE 5: REPORTS TAB ===');

  // Step 16: Reports tab
  console.log('\nStep 16: Reports tab');
  const reportsTab = page.locator('button:has-text("Reports"), a:has-text("Reports"), nav >> text="Reports"');
  if (await reportsTab.count() > 0) {
    await reportsTab.first().click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'reports_tab', tabIndex);
    tabIndex++;
  }

  // Step 17: Check reports API
  console.log('\nStep 17: Check /api/reports');
  const reportsResp = await page.evaluate(async () => {
    const r = await fetch('/api/reports');
    return { status: r.status, body: await r.json() };
  });
  console.log('Reports API:', JSON.stringify(reportsResp, null, 2));

  // ========== PHASE 6: SCAFFOLDED AGENTS ==========
  console.log('\n=== PHASE 6: SCAFFOLDED AGENTS ===');

  // Step 18: Check file system
  console.log('\nStep 18: Check scaffolded files');
  const scaffoldCheck = await page.evaluate(async () => {
    // Check via agents API
    const r = await fetch('/api/agents');
    return await r.json();
  });
  console.log('Agents from API:', JSON.stringify(scaffoldCheck, null, 2));

  // ========== PHASE 7: SECURITY + CONSOLE ERRORS ==========
  console.log('\n=== PHASE 7: SECURITY + CONSOLE ERRORS ===');

  // Step 20: Console errors collected throughout
  console.log('\nStep 20: Console errors collected:');
  console.log(JSON.stringify(consoleErrors, null, 2));

  // Step 21: Check for leaked references
  console.log('\nStep 21: Check for leaked references');
  const fullPageText = await page.textContent('body');
  const leakedEnpal = fullPageText?.includes('Enpal');
  const leakedInPipeline = fullPageText?.includes('InPipeline');
  console.log('Contains "Enpal":', leakedEnpal);
  console.log('Contains "InPipeline":', leakedInPipeline);
  if (leakedEnpal) bug('P1', 'Leaked "Enpal" reference in UI', 'Open source product should not mention Enpal');
  if (leakedInPipeline) bug('P1', 'Leaked "InPipeline" reference in UI', 'Open source product should not mention InPipeline');

  // Step 22: Check API responses for secrets
  console.log('\nStep 22: Check API for leaked secrets');
  const configText = JSON.stringify(configResp);
  const hasSecrets = configText.includes('sk-') || configText.includes('password') || configText.includes('secret');
  console.log('API contains secrets:', hasSecrets);
  if (hasSecrets) bug('P0', 'API leaks secrets', 'Config API response contains sensitive data');

  // ========== FINAL REPORT ==========
  console.log('\n\n========== FINAL REPORT ==========');
  console.log('Total bugs found:', bugs.length);
  bugs.forEach(b => console.log(`  [${b.severity}] ${b.title}: ${b.details}`));
  console.log('\nConsole errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log(`  [${e.context}] ${e.message}`));

  // Health score
  const p0 = bugs.filter(b => b.severity === 'P0').length;
  const p1 = bugs.filter(b => b.severity === 'P1').length;
  const p2 = bugs.filter(b => b.severity === 'P2').length;
  const p3 = bugs.filter(b => b.severity === 'P3').length;
  const score = Math.max(0, 100 - (p0 * 25) - (p1 * 15) - (p2 * 5) - (p3 * 1));
  console.log(`\nHealth Score: ${score}/100`);
  console.log(`  P0: ${p0}, P1: ${p1}, P2: ${p2}, P3: ${p3}`);

  await browser.close();

  // Write report JSON
  const report = { bugs, consoleErrors, healthScore: score, severity: { p0, p1, p2, p3 } };
  writeFileSync(`${SCREENSHOTS}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to ${SCREENSHOTS}/report.json`);
})();

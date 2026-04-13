import { chromium } from 'playwright';
import { writeFileSync, existsSync, readdirSync } from 'fs';

const BASE = 'http://localhost:8080';
const SS = '/Users/vatsalbhatt230813/Code/InPipeline/agent-console/qa-screenshots';
const bugs = [];
const consoleErrors = [];
let stepNum = 0;

function bug(sev, title, details) {
  bugs.push({ severity: sev, title, details });
  console.log(`[BUG ${sev}] ${title}: ${details}`);
}

async function ss(page, name) {
  stepNum++;
  const path = `${SS}/${stepNum.toString().padStart(2,'0')}_${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`[SS ${stepNum}] ${name}`);
  return path;
}

async function clickNext(page) {
  const btn = page.locator('button:has-text("Next")');
  if (await btn.count() > 0) {
    await btn.first().click();
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

async function clickFinish(page) {
  const btn = page.locator('button:has-text("Finish"), button:has-text("Complete"), button:has-text("Launch")');
  if (await btn.count() > 0) {
    await btn.first().click();
    await page.waitForTimeout(2000);
    return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Collect console errors
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('favicon') && !t.includes('DevTools') && !t.includes('download the React DevTools')) {
        consoleErrors.push({ url: page.url(), message: t.substring(0, 200) });
      }
    }
  });
  page.on('pageerror', err => {
    pageErrors.push({ url: page.url(), message: err.message.substring(0, 200) });
  });

  // =====================================================
  // PHASE 1: SETUP WIZARD (7 steps)
  // =====================================================
  console.log('\n=== PHASE 1: SETUP WIZARD ===\n');

  // Step 1: Welcome
  console.log('--- Step 1/7: Welcome ---');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await ss(page, 'wizard_01_welcome');

  const welcomeText = await page.textContent('body');
  const hasWelcome = welcomeText?.includes('Welcome to Agent Studio');
  console.log('Welcome text present:', hasWelcome);
  if (!hasWelcome) bug('P0', 'Setup wizard not shown', 'Expected "Welcome to Agent Studio" on first load');

  // Verify step indicator shows 1/4
  const stepIndicator = welcomeText?.match(/\d+ \/ \d+/)?.[0];
  console.log('Step indicator:', stepIndicator);

  await clickNext(page);
  await ss(page, 'wizard_02_projects');

  // Step 2: Projects
  console.log('\n--- Step 2/7: Projects ---');
  const projectsText = await page.textContent('body');
  const hasProjects = projectsText?.includes('Where are your projects');
  console.log('Projects step visible:', hasProjects);
  if (!hasProjects) bug('P1', 'Projects step not shown', 'After clicking Next from Welcome, Projects step not visible');

  // Check Next is disabled (no projects added yet)
  const nextBtnDisabled = await page.locator('button:has-text("Next")').first().isDisabled().catch(() => false);
  console.log('Next disabled before adding project:', nextBtnDisabled);
  if (!nextBtnDisabled) {
    // Not necessarily a bug - might allow skipping
    console.log('Note: Next is enabled even without projects');
  }

  // Add project
  const input = page.locator('input[type="text"]').first();
  await input.fill('/tmp/fittrack-app');
  await page.waitForTimeout(300);

  // Click + Add
  const addBtn = page.locator('button:has-text("Add")');
  if (await addBtn.count() > 0) {
    await addBtn.first().click();
    await page.waitForTimeout(800);
  }
  await ss(page, 'wizard_03_project_added');

  // Verify project appears in list
  const afterAdd = await page.textContent('body');
  const projectAdded = afterAdd?.includes('fittrack-app');
  console.log('Project visible in list:', projectAdded);
  if (!projectAdded) bug('P1', 'Project not added to list', '/tmp/fittrack-app not visible after clicking Add');

  // Check for "dev" badge
  const hasDev = afterAdd?.includes('dev');
  console.log('Dev badge present:', hasDev);

  await clickNext(page);
  await ss(page, 'wizard_04_agent_system');

  // Step 3: Agent System
  console.log('\n--- Step 3/7: Agent System ---');
  const agentSysText = await page.textContent('body');
  console.log('Agent System step visible:', agentSysText?.includes('AI Agent System'));

  // Select "Create a new one"
  const createOption = page.locator('text=Create a new one');
  if (await createOption.count() > 0) {
    await createOption.first().click();
    await page.waitForTimeout(500);
  }
  await ss(page, 'wizard_05_create_selected');

  // Check that description text and project type input appeared
  const createText = await page.textContent('body');
  const hasScaffoldInfo = createText?.includes('ai-agents/') || createText?.includes('.claude/agents/');
  console.log('Scaffold info shown:', hasScaffoldInfo);

  // Optionally fill in project type
  const projTypeInput = page.locator('input[placeholder*="React"], input[placeholder*="project"], textarea');
  if (await projTypeInput.count() > 0) {
    await projTypeInput.first().fill('React Native + FastAPI fitness tracking app');
    await page.waitForTimeout(300);
  }

  // Verify step count changed from 4 to 7
  const stepCount = createText?.match(/\d+ \/ (\d+)/)?.[1];
  console.log('Total steps after Create:', stepCount);
  if (stepCount === '7') {
    console.log('PASS: Dynamic step expansion works (4 -> 7)');
  } else if (stepCount === '4') {
    bug('P2', 'Steps did not expand', 'Selecting Create a new one should expand wizard to 7 steps');
  }

  await clickNext(page);
  await ss(page, 'wizard_06_agent_team');

  // Step 4: Agent Team
  console.log('\n--- Step 4/7: Agent Team ---');
  const teamText = await page.textContent('body');
  console.log('Agent Team step visible:', teamText?.includes('Which agents'));

  // Verify default selections
  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  console.log('Checkboxes found:', checkboxCount);

  // Check pre-selected agents
  const selectedCount = teamText?.match(/(\d+) selected/)?.[1];
  console.log('Pre-selected agents:', selectedCount);

  // Verify agent names
  const expectedAgents = ['orchestrator', 'frontend', 'backend', 'qa', 'security'];
  for (const agent of expectedAgents) {
    const found = teamText?.includes(agent);
    console.log(`  Agent "${agent}":`, found ? 'present' : 'MISSING');
    if (!found) bug('P2', `Agent "${agent}" missing from team step`, `Expected to see ${agent} in agent selection`);
  }

  // Test Select All / Select None
  const selectAll = page.locator('button:has-text("Select All")');
  if (await selectAll.count() > 0) {
    await selectAll.first().click();
    await page.waitForTimeout(300);
    const afterAll = await page.textContent('body');
    const allCount = afterAll?.match(/(\d+) selected/)?.[1];
    console.log('After Select All:', allCount, 'selected');
  }

  await clickNext(page);
  await ss(page, 'wizard_07_workflow');

  // Step 5: Workflow
  console.log('\n--- Step 5/7: Workflow ---');
  const wfText = await page.textContent('body');
  console.log('Workflow step visible:', wfText?.includes('How does your team work'));

  // Verify workflow options
  const hasSprintPlanning = wfText?.includes('Sprint Planning');
  const hasSimplePipeline = wfText?.includes('Simple Pipeline');
  const hasCustom = wfText?.includes('Custom');
  console.log('Sprint Planning:', hasSprintPlanning);
  console.log('Simple Pipeline:', hasSimplePipeline);
  console.log('Custom:', hasCustom);

  // Select Simple Pipeline for our fitness app
  const simplePipeline = page.locator('text=Simple Pipeline');
  if (await simplePipeline.count() > 0) {
    await simplePipeline.first().click();
    await page.waitForTimeout(300);
  }
  await ss(page, 'wizard_08_workflow_selected');

  await clickNext(page);
  await ss(page, 'wizard_09_automation');

  // Step 6: Automation
  console.log('\n--- Step 6/7: Automation ---');
  const autoText = await page.textContent('body');
  console.log('Automation step visible:', autoText?.includes('Automation') || autoText?.includes('automat'));
  console.log('Automation text (first 300):', autoText?.substring(0, 300));

  await ss(page, 'wizard_10_automation_detail');

  await clickNext(page);
  await ss(page, 'wizard_11_preferences');

  // Step 7: Preferences
  console.log('\n--- Step 7/7: Preferences ---');
  const prefText = await page.textContent('body');
  console.log('Preferences step visible:', prefText?.includes('Preference') || prefText?.includes('model') || prefText?.includes('Model'));
  console.log('Preferences text (first 400):', prefText?.substring(0, 400));

  // Look for model selector
  const selects = page.locator('select');
  const selectCount = await selects.count();
  console.log('Select dropdowns found:', selectCount);

  for (let i = 0; i < selectCount; i++) {
    const opts = await selects.nth(i).locator('option').allTextContents();
    console.log(`  Select ${i} options:`, opts);
  }

  // Try to find and click Finish
  await ss(page, 'wizard_12_before_finish');

  const finished = await clickFinish(page);
  if (!finished) {
    // Maybe it's still "Next" on last step
    const clicked = await clickNext(page);
    if (!clicked) {
      bug('P1', 'No Finish button on last step', 'Could not find Finish/Complete/Launch button');
    }
  }

  await page.waitForTimeout(2000);
  await ss(page, 'wizard_13_after_finish');

  // =====================================================
  // PHASE 2: VERIFY SETUP
  // =====================================================
  console.log('\n=== PHASE 2: VERIFY SETUP ===\n');

  // Check config API
  const configResp = await page.evaluate(async () => {
    const r = await fetch('/api/config');
    return await r.json();
  });
  console.log('Config after wizard:', JSON.stringify(configResp, null, 2));

  const setupDone = configResp.config?.setupComplete;
  console.log('setupComplete:', setupDone);
  if (!setupDone) bug('P0', 'Setup not marked complete', 'After finishing wizard, setupComplete is still false');

  const projects = configResp.config?.projects || [];
  const hasFittrack = projects.some(p => p.path?.includes('fittrack') || p.name?.includes('fittrack'));
  console.log('fittrack-app in projects:', hasFittrack);
  if (!hasFittrack) bug('P1', 'Project not saved', 'fittrack-app not in config after wizard completion');

  // Check agents API
  const agentsResp = await page.evaluate(async () => {
    const r = await fetch('/api/agents');
    return await r.json();
  });
  console.log('Agents:', JSON.stringify(agentsResp, null, 2));

  // Check filesystem for scaffolded files
  console.log('\nChecking scaffolded files...');

  // Check dashboard state
  await ss(page, 'dashboard_main');
  const dashText = await page.textContent('body');
  console.log('Dashboard text (first 500):', dashText?.substring(0, 500));

  // =====================================================
  // PHASE 3: DASHBOARD EXPLORATION
  // =====================================================
  console.log('\n=== PHASE 3: DASHBOARD EXPLORATION ===\n');

  // Find navigation elements
  const navLinks = await page.locator('nav a, nav button, aside a, aside button, [role="tablist"] button').allTextContents();
  console.log('Navigation elements found:', navLinks);

  // Try sidebar links
  const sidebarItems = page.locator('aside a, aside button, nav a, nav button');
  const sidebarCount = await sidebarItems.count();
  console.log('Sidebar/nav items:', sidebarCount);

  // Look for tabs: Sessions, Teams, Memory, Reports, Settings
  const tabNames = ['Sessions', 'Teams', 'Memory', 'Reports', 'Settings'];

  for (const tab of tabNames) {
    console.log(`\n--- Tab: ${tab} ---`);
    // Try multiple selectors
    const tabEl = page.locator(`text="${tab}"`).first();
    if (await tabEl.count() > 0) {
      // Check if it's clickable
      try {
        await tabEl.click({ timeout: 2000 });
        await page.waitForTimeout(1000);
        await ss(page, `tab_${tab.toLowerCase()}`);
        const tabContent = await page.textContent('body');
        console.log(`${tab} tab content (first 200):`, tabContent?.substring(0, 200));
      } catch (e) {
        console.log(`${tab}: found but not clickable - ${e.message.substring(0, 100)}`);
      }
    } else {
      // Try case-insensitive and partial match
      const altTabEl = page.locator(`a:has-text("${tab}"), button:has-text("${tab}"), [data-tab="${tab.toLowerCase()}"]`);
      if (await altTabEl.count() > 0) {
        await altTabEl.first().click();
        await page.waitForTimeout(1000);
        await ss(page, `tab_${tab.toLowerCase()}`);
      } else {
        console.log(`${tab} tab: NOT FOUND anywhere on page`);
        bug('P2', `${tab} tab missing`, `Cannot find ${tab} navigation element on dashboard`);
      }
    }
  }

  // Check console errors after navigation
  console.log('\nConsole errors after navigation:', consoleErrors.length);

  // =====================================================
  // PHASE 4: SESSION LAUNCHER
  // =====================================================
  console.log('\n=== PHASE 4: SESSION LAUNCHER ===\n');

  // Look for New Session button
  const newSessBtns = page.locator('button:has-text("New Session"), button:has-text("+ New"), button:has-text("Launch Session"), button:has-text("Start Session")');
  if (await newSessBtns.count() > 0) {
    await newSessBtns.first().click();
    await page.waitForTimeout(1000);
    await ss(page, 'session_launcher_dialog');

    // Check for agent dropdown
    const agentSelector = page.locator('select, [role="combobox"], [role="listbox"]');
    if (await agentSelector.count() > 0) {
      console.log('Agent selector found in session launcher');
      const opts = await agentSelector.first().locator('option').allTextContents().catch(() => []);
      console.log('Agent options:', opts);
    }
  } else {
    console.log('No session launcher button found');
    // Check if there is a + icon button
    const plusBtns = await page.locator('button').allTextContents();
    console.log('All buttons on page:', plusBtns.filter(t => t.trim()).join(', '));
  }

  // =====================================================
  // PHASE 5: SETTINGS & AUTOMATIONS
  // =====================================================
  console.log('\n=== PHASE 5: SETTINGS & AUTOMATIONS ===\n');

  // Navigate to settings
  const settingsLink = page.locator('text="Settings"').first();
  if (await settingsLink.count() > 0) {
    await settingsLink.click();
    await page.waitForTimeout(1000);
    await ss(page, 'settings_page');

    // Scroll to find automations
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await ss(page, 'settings_scrolled');

    const settingsText = await page.textContent('body');
    console.log('Has Automations section:', settingsText?.includes('Automation'));
  }

  // Check automations API
  const autoResp = await page.evaluate(async () => {
    const r = await fetch('/api/automations');
    return { status: r.status, body: await r.json() };
  });
  console.log('Automations API:', JSON.stringify(autoResp, null, 2));

  // Check reports API
  const reportsResp = await page.evaluate(async () => {
    const r = await fetch('/api/reports');
    return { status: r.status, body: await r.json() };
  });
  console.log('Reports API:', JSON.stringify(reportsResp, null, 2));

  // =====================================================
  // PHASE 6: SCAFFOLDED FILES
  // =====================================================
  console.log('\n=== PHASE 6: SCAFFOLDED FILES ===\n');

  // This needs to be checked via filesystem, not browser

  // =====================================================
  // PHASE 7: SECURITY & CONSOLE
  // =====================================================
  console.log('\n=== PHASE 7: SECURITY & CONSOLE ===\n');

  // Check for leaked references
  const fullText = await page.textContent('body') || '';
  const leaks = {
    'Enpal': fullText.includes('Enpal'),
    'InPipeline': fullText.includes('InPipeline'),
    'vatsalbhatt': fullText.includes('vatsalbhatt'),
  };
  console.log('Leak check:', leaks);
  for (const [term, found] of Object.entries(leaks)) {
    if (found) bug('P1', `Leaked "${term}" in UI`, `Open source product contains "${term}"`);
  }

  // Check API for secrets
  const configStr = JSON.stringify(configResp);
  if (configStr.includes('sk-') || configStr.includes('supabase')) {
    bug('P0', 'API leaks secrets', 'Config API contains sensitive keys');
  }

  // Check if home dir is exposed
  if (configStr.includes('/Users/')) {
    console.log('Note: API exposes home directory path (expected for local tool)');
  }

  // Final console error summary
  console.log('\nPage errors:', pageErrors.length);
  pageErrors.forEach(e => console.log(`  ${e.message}`));
  console.log('Console errors:', consoleErrors.length);
  consoleErrors.forEach(e => console.log(`  [${e.url}] ${e.message}`));

  // =====================================================
  // FINAL REPORT
  // =====================================================
  console.log('\n\n========================================');
  console.log('           FINAL QA REPORT');
  console.log('========================================\n');

  console.log(`Total bugs: ${bugs.length}`);
  const p0 = bugs.filter(b => b.severity === 'P0').length;
  const p1 = bugs.filter(b => b.severity === 'P1').length;
  const p2 = bugs.filter(b => b.severity === 'P2').length;
  const p3 = bugs.filter(b => b.severity === 'P3').length;
  const score = Math.max(0, 100 - (p0*25) - (p1*15) - (p2*5) - (p3*1));

  console.log(`\nHealth Score: ${score}/100`);
  console.log(`  P0 (Critical): ${p0}`);
  console.log(`  P1 (High):     ${p1}`);
  console.log(`  P2 (Medium):   ${p2}`);
  console.log(`  P3 (Low):      ${p3}`);
  console.log(`\nConsole errors: ${consoleErrors.length}`);
  console.log(`Page errors: ${pageErrors.length}`);

  console.log('\nBugs:');
  bugs.forEach((b, i) => console.log(`  ${i+1}. [${b.severity}] ${b.title}\n     ${b.details}`));

  await browser.close();

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    healthScore: score,
    severity: { p0, p1, p2, p3 },
    bugs,
    consoleErrors,
    pageErrors,
    totalScreenshots: stepNum
  };
  writeFileSync(`${SS}/report.json`, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${SS}/report.json`);
  console.log(`Screenshots: ${stepNum} files in ${SS}/`);
})();

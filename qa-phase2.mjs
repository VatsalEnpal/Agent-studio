import { chromium } from 'playwright';
import { writeFileSync, existsSync, readdirSync } from 'fs';

const BASE = 'http://localhost:8080';
const SS = '/Users/vatsalbhatt230813/Code/InPipeline/agent-console/qa-screenshots';
const bugs = [];
const consoleErrors = [];
let stepNum = 20;

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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('favicon') && !t.includes('DevTools') && !t.includes('React DevTools')) {
        consoleErrors.push({ url: page.url(), message: t.substring(0, 300) });
      }
    }
  });

  // =====================================================
  // Navigate to dashboard (wizard should be done)
  // =====================================================
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Verify we're on the dashboard, not the wizard
  const bodyText = await page.textContent('body');
  const isWizard = bodyText?.includes('Welcome to Agent Studio') && bodyText?.includes('1 / 4');
  console.log('On dashboard (not wizard):', !isWizard);
  if (isWizard) {
    bug('P0', 'Wizard shown after completion', 'Setup wizard reappears despite setupComplete=true');
  }
  await ss(page, 'dashboard_loaded');

  // =====================================================
  // PHASE 3: Settings deep dive
  // =====================================================
  console.log('\n=== SETTINGS PAGE ===\n');

  const settingsBtn = page.locator('text="Settings"').first();
  await settingsBtn.click();
  await page.waitForTimeout(1500);
  await ss(page, 'settings_full');

  // Scroll down to see full page
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(500);
  await ss(page, 'settings_scrolled_1');

  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(500);
  await ss(page, 'settings_scrolled_2');

  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(500);
  await ss(page, 'settings_scrolled_3');

  // Check Settings content
  const settingsText = await page.textContent('body');
  console.log('Has Workspace section:', settingsText?.includes('Workspace'));
  console.log('Has General section:', settingsText?.includes('General'));
  console.log('Has PMO Scheduler:', settingsText?.includes('PMO Scheduler'));
  console.log('Has Automations:', settingsText?.includes('Automation'));
  console.log('Has fittrack-app:', settingsText?.includes('fittrack-app'));
  console.log('Has Agent System path:', settingsText?.includes('ai-agents'));
  console.log('Has Re-run Setup Wizard:', settingsText?.includes('Re-run'));

  // Check if model is set correctly
  console.log('Has sonnet selected:', settingsText?.includes('sonnet'));

  // =====================================================
  // Test New Session dialog in detail
  // =====================================================
  console.log('\n=== SESSION LAUNCHER DETAIL ===\n');

  // Go to Sessions tab first
  await page.locator('text="Sessions"').first().click();
  await page.waitForTimeout(1000);

  // Click New Session
  const newSessBtn = page.locator('button:has-text("New Session")').first();
  await newSessBtn.click();
  await page.waitForTimeout(1000);
  await ss(page, 'session_launcher_detail');

  // Check quick start options
  const launcherText = await page.textContent('body');
  console.log('Has Continue:', launcherText?.includes('Continue'));
  console.log('Has Quick Chat:', launcherText?.includes('Quick Chat'));
  console.log('Has Start Sprint:', launcherText?.includes('Start Sprint'));
  console.log('Has Security Audit:', launcherText?.includes('Security Audit'));
  console.log('Has PMO Scan:', launcherText?.includes('PMO Scan'));

  // Check model dropdown
  const modelSelect = page.locator('select').first();
  if (await modelSelect.count() > 0) {
    const modelOpts = await modelSelect.locator('option').allTextContents();
    console.log('Model options:', modelOpts);
  }

  // Check agent dropdown
  const allSelects = page.locator('select');
  const selectCount = await allSelects.count();
  console.log('Total selects in launcher:', selectCount);
  for (let i = 0; i < selectCount; i++) {
    const opts = await allSelects.nth(i).locator('option').allTextContents();
    console.log(`  Select ${i}:`, opts);
  }

  // Check working directory
  const wdInput = page.locator('input[value*="fittrack"]');
  if (await wdInput.count() > 0) {
    const val = await wdInput.first().inputValue();
    console.log('Working directory:', val);
  }

  // Close dialog by pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // =====================================================
  // PHASE 4: Teams tab deep dive
  // =====================================================
  console.log('\n=== TEAMS TAB ===\n');

  await page.locator('text="Teams"').first().click();
  await page.waitForTimeout(1500);
  await ss(page, 'teams_tab_detail');

  const teamsText = await page.textContent('body');
  console.log('Has Sprint Planning:', teamsText?.includes('Sprint Planning'));
  console.log('Has Current Sprint:', teamsText?.includes('Current Sprint'));
  console.log('Has PMO Scan:', teamsText?.includes('PMO Scan'));
  console.log('Has System info:', teamsText?.includes('SYSTEM'));

  // Check sprint steps
  const steps = ['PMO Scan', 'Readiness Report', 'Sprint Approval', 'Design', 'Backend Build', 'Frontend Build', 'QA Testing', 'Ship'];
  for (const step of steps) {
    const found = teamsText?.includes(step);
    console.log(`  Step "${step}":`, found ? 'present' : 'MISSING');
  }

  // =====================================================
  // PHASE 5: Memory tab deep dive
  // =====================================================
  console.log('\n=== MEMORY TAB ===\n');

  await page.locator('text="Memory"').first().click();
  await page.waitForTimeout(1000);
  await ss(page, 'memory_tab_detail');

  const memText = await page.textContent('body');
  console.log('Has search bar:', memText?.includes('Search'));
  console.log('Has filter tags:', memText?.includes('Learnings') && memText?.includes('Corrections'));
  console.log('Has empty state:', memText?.includes('No memories'));

  // =====================================================
  // PHASE 6: Reports tab
  // =====================================================
  console.log('\n=== REPORTS TAB ===\n');

  await page.locator('text="Reports"').first().click();
  await page.waitForTimeout(1000);
  await ss(page, 'reports_tab_detail');

  const repText = await page.textContent('body');
  console.log('Has empty state:', repText?.includes('No reports'));
  console.log('Has guidance text:', repText?.includes('automation') || repText?.includes('Settings'));

  // =====================================================
  // PHASE 7: Check scaffolded files
  // =====================================================
  console.log('\n=== SCAFFOLDED FILES ===\n');

  const paths = [
    '/tmp/fittrack-app/.claude',
    '/tmp/fittrack-app/.claude/agents',
    '/tmp/fittrack-app/ai-agents',
    '/tmp/fittrack-app/ai-agents/agents',
    '/tmp/fittrack-app/ai-agents/memory',
    '/tmp/fittrack-app/ai-agents/tools',
  ];

  for (const p of paths) {
    const exists = existsSync(p);
    console.log(`${p}: ${exists ? 'EXISTS' : 'MISSING'}`);
    if (exists) {
      try {
        const items = readdirSync(p);
        console.log(`  Contents: ${items.join(', ')}`);
      } catch {}
    }
    if (!exists && p.includes('ai-agents')) {
      bug('P1', `Scaffold missing: ${p}`, 'Agent system was supposed to be scaffolded but directory not found');
    }
  }

  // Check .claude/agents for agent files
  if (existsSync('/tmp/fittrack-app/.claude/agents')) {
    const agents = readdirSync('/tmp/fittrack-app/.claude/agents');
    console.log('\n.claude/agents files:', agents);
  }

  // =====================================================
  // PHASE 8: API validation
  // =====================================================
  console.log('\n=== API VALIDATION ===\n');

  // Test all API endpoints
  const endpoints = [
    '/api/config',
    '/api/agents',
    '/api/automations',
    '/api/reports',
    '/api/sessions',
    '/api/health',
    '/api/memory',
    '/api/sprint',
  ];

  for (const ep of endpoints) {
    try {
      const resp = await page.evaluate(async (url) => {
        const r = await fetch(url);
        const body = await r.text();
        return { status: r.status, bodyLen: body.length, bodySnippet: body.substring(0, 200) };
      }, ep);
      console.log(`${ep}: ${resp.status} (${resp.bodyLen} bytes)`);
      if (resp.status >= 500) {
        bug('P1', `API ${ep} returns 500`, `Server error: ${resp.bodySnippet}`);
      }
    } catch (e) {
      console.log(`${ep}: ERROR - ${e.message}`);
    }
  }

  // =====================================================
  // PHASE 9: Visual checks
  // =====================================================
  console.log('\n=== VISUAL CHECKS ===\n');

  // Check header bar content
  const headerText = await page.locator('header, nav').first().textContent().catch(() => '');
  console.log('Header contains:', headerText?.substring(0, 200));

  // Check for "Off-Peak" indicator
  console.log('Has Off-Peak indicator:', bodyText?.includes('Off-Peak'));

  // Check status bar / footer
  const footerText = await page.locator('footer, .bottom-bar, [class*="status"]').first().textContent().catch(() => '');
  console.log('Footer/status bar:', footerText?.substring(0, 100));

  // Check keyboard shortcuts hint
  console.log('Has Cmd+N hint:', bodyText?.includes('Cmd') || bodyText?.includes('⌘'));
  console.log('Has Cmd+K hint:', bodyText?.includes('commands'));

  // =====================================================
  // PHASE 10: Security
  // =====================================================
  console.log('\n=== SECURITY ===\n');

  // Check all visible text for leaked references
  const allText = await page.evaluate(() => document.body.innerText);
  const leakChecks = {
    'Enpal': allText.includes('Enpal'),
    'InPipeline': allText.includes('InPipeline'),
    'supabase': allText.toLowerCase().includes('supabase'),
    'sk-ant': allText.includes('sk-ant'),
    'ANTHROPIC_API_KEY': allText.includes('ANTHROPIC_API_KEY'),
  };
  console.log('Leak checks:', leakChecks);
  for (const [term, found] of Object.entries(leakChecks)) {
    if (found && !['supabase'].includes(term.toLowerCase())) {
      bug('P1', `Leaked "${term}"`, `UI contains "${term}" which should not be visible`);
    }
  }

  // Console errors summary
  console.log('\n=== CONSOLE ERRORS ===\n');
  console.log(`Total: ${consoleErrors.length}`);
  consoleErrors.forEach(e => console.log(`  [${e.url}] ${e.message}`));
  if (consoleErrors.length > 0) {
    bug('P2', `${consoleErrors.length} console error(s)`, consoleErrors.map(e => e.message).join('; '));
  }

  // =====================================================
  // FINAL REPORT
  // =====================================================
  console.log('\n\n========================================');
  console.log('           PHASE 2 QA REPORT');
  console.log('========================================\n');

  const p0 = bugs.filter(b => b.severity === 'P0').length;
  const p1 = bugs.filter(b => b.severity === 'P1').length;
  const p2 = bugs.filter(b => b.severity === 'P2').length;
  const p3 = bugs.filter(b => b.severity === 'P3').length;
  const score = Math.max(0, 100 - (p0*25) - (p1*15) - (p2*5) - (p3*1));

  console.log(`Health Score: ${score}/100`);
  console.log(`  P0: ${p0}, P1: ${p1}, P2: ${p2}, P3: ${p3}`);
  console.log(`\nBugs:`);
  bugs.forEach((b, i) => console.log(`  ${i+1}. [${b.severity}] ${b.title}\n     ${b.details}`));

  await browser.close();

  writeFileSync(`${SS}/report_phase2.json`, JSON.stringify({ bugs, consoleErrors, healthScore: score }, null, 2));
})();

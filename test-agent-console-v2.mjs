import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/agent-console/test-screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleMessages = [];
  const networkRequests = [];
  const pageErrors = [];

  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('request', req => {
    networkRequests.push({ url: req.url(), method: req.method(), time: Date.now() });
  });
  page.on('response', resp => {
    const idx = networkRequests.findIndex(r => r.url === resp.url() && !r.status);
    if (idx >= 0) networkRequests[idx].status = resp.status();
  });
  page.on('requestfailed', req => {
    const idx = networkRequests.findIndex(r => r.url === req.url() && !r.status);
    if (idx >= 0) networkRequests[idx].status = 'FAILED: ' + req.failure()?.errorText;
  });

  // Step 1: Test API directly first
  console.log('\n=== PRE-TEST: Direct API calls ===');
  try {
    const resp = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/sessions');
        return { status: r.status, body: await r.text() };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('GET /api/sessions (before navigation):', JSON.stringify(resp));
  } catch (e) {
    // Page not loaded yet, navigate first
    console.log('Need to navigate first');
  }

  console.log('\n=== STEP 1: Navigate ===');
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Navigation complete');

  // Wait for React to hydrate
  await sleep(1000);

  // Step 2: Test API directly from browser context
  console.log('\n=== STEP 2: Direct API test from browser ===');
  const apiTestResult = await page.evaluate(async () => {
    const results = {};

    // Test GET /api/sessions
    try {
      const r = await fetch('/api/sessions');
      results.getSessions = { status: r.status, body: await r.json() };
    } catch (e) {
      results.getSessions = { error: e.message };
    }

    // Test GET /api/processes
    try {
      const r = await fetch('/api/processes');
      results.getProcesses = { status: r.status, body: await r.json() };
    } catch (e) {
      results.getProcesses = { error: e.message };
    }

    // Test POST /api/sessions
    try {
      const r = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Agent',
          command: 'claude',
          args: ['--dangerously-skip-permissions'],
        }),
      });
      const body = await r.text();
      results.postSession = { status: r.status, body };
    } catch (e) {
      results.postSession = { error: e.message };
    }

    return results;
  });

  console.log('GET /api/sessions:', JSON.stringify(apiTestResult.getSessions, null, 2));
  console.log('GET /api/processes:', JSON.stringify(apiTestResult.getProcesses, null, 2));
  console.log('POST /api/sessions:', JSON.stringify(apiTestResult.postSession, null, 2));

  // Step 3: Check WebSocket connection status
  console.log('\n=== STEP 3: WebSocket status ===');
  const wsStatus = await page.evaluate(() => {
    // Check all WebSocket instances
    const info = {};
    // Check if wsClient is accessible
    // We can check the window for any WebSocket references
    const wsInstances = [];
    const origWS = window.WebSocket;
    return 'WebSocket available: ' + !!origWS;
  });
  console.log(wsStatus);

  // Check for WebSocket in network requests
  const wsRequests = networkRequests.filter(r => r.url.includes('/ws'));
  console.log('WS requests found:', wsRequests.length);
  wsRequests.forEach(r => console.log(`  ${r.method} ${r.url} -> ${r.status || 'pending'}`));

  // Step 4: Now click the button and watch carefully
  console.log('\n=== STEP 4: Click "+ New Session" with full monitoring ===');

  // Add a fetch interceptor
  await page.evaluate(() => {
    const origFetch = window.fetch;
    window.__fetchLog = [];
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const method = args[1]?.method || 'GET';
      window.__fetchLog.push({ url, method, time: Date.now(), state: 'started' });
      try {
        const resp = await origFetch.apply(this, args);
        window.__fetchLog.push({ url, method, status: resp.status, state: 'completed' });
        return resp;
      } catch (err) {
        window.__fetchLog.push({ url, method, error: err.message, state: 'failed' });
        throw err;
      }
    };
  });

  // Clear previous console messages
  const consoleBefore = consoleMessages.length;

  // Click the button
  await page.locator('button:has-text("New Session")').click();
  console.log('Button clicked');

  // Wait for response
  await sleep(3000);

  // Check fetch log
  const fetchLog = await page.evaluate(() => window.__fetchLog || []);
  console.log('Fetch log after click:', JSON.stringify(fetchLog, null, 2));

  // Check new console messages
  const newConsole = consoleMessages.slice(consoleBefore);
  console.log('New console messages:', newConsole.length);
  newConsole.forEach(m => console.log(`  [${m.type}] ${m.text}`));

  // Check new network requests
  const newNetwork = networkRequests.filter(r => r.time > Date.now() - 5000);
  console.log('Recent network requests:', newNetwork.length);
  newNetwork.forEach(r => console.log(`  ${r.method} ${r.url} -> ${r.status || 'pending'}`));

  // Take screenshot
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-after-click-v2.png'), fullPage: true });
  console.log('Screenshot saved: 05-after-click-v2.png');

  // Get visible text
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000));
  console.log('Visible text:', bodyText);

  // Check for any error/alert dialogs
  console.log('\n=== STEP 5: Check button state ===');
  const buttonState = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).map(b => ({
      text: b.innerText,
      disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
    }));
  });
  console.log('Button states:', JSON.stringify(buttonState, null, 2));

  // Step 6: Check if there's a session now
  console.log('\n=== STEP 6: Sessions after click ===');
  const sessionsAfter = await page.evaluate(async () => {
    const r = await fetch('/api/sessions');
    return { status: r.status, body: await r.json() };
  });
  console.log('GET /api/sessions:', JSON.stringify(sessionsAfter, null, 2));

  // Step 7: Look for terminal elements
  console.log('\n=== STEP 7: DOM inspection ===');
  const domInfo = await page.evaluate(() => {
    return {
      xtermElements: document.querySelectorAll('.xterm').length,
      canvasElements: document.querySelectorAll('canvas').length,
      terminalElements: document.querySelectorAll('[class*="terminal"]').length,
      iframes: document.querySelectorAll('iframe').length,
      inputs: document.querySelectorAll('input, textarea').length,
      allClassNames: Array.from(new Set(
        Array.from(document.querySelectorAll('*'))
          .flatMap(el => Array.from(el.classList))
      )).filter(c => c.includes('terminal') || c.includes('xterm') || c.includes('session')),
    };
  });
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));

  // Wait a bit more and check again
  await sleep(3000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-after-longer-wait.png'), fullPage: true });

  const bodyText2 = await page.evaluate(() => document.body?.innerText?.substring(0, 2000));
  console.log('\nVisible text after 6s wait:', bodyText2);

  const sessionsLater = await page.evaluate(async () => {
    const r = await fetch('/api/sessions');
    return { status: r.status, body: await r.json() };
  });
  console.log('GET /api/sessions (6s later):', JSON.stringify(sessionsLater, null, 2));

  console.log('\n\n========== FINAL SUMMARY ==========');
  console.log('Total console errors:', consoleMessages.filter(m => m.type === 'error').length);
  console.log('Total page errors:', pageErrors.length);
  console.log('Total failed network requests:', networkRequests.filter(r => String(r.status).startsWith('FAILED')).length);
  console.log('Screenshots dir:', SCREENSHOTS_DIR);

  await browser.close();
}

test().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});

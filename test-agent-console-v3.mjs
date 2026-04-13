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
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'PAGE_ERROR', text: err.message }));

  // Listen for dialog (alert)
  page.on('dialog', async dialog => {
    console.log(`  ALERT DIALOG: "${dialog.message()}"`);
    await dialog.accept();
  });

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Page loaded');

  // Wait for hydration
  await sleep(2000);

  // Test 1: Check if the React component is hydrated properly
  console.log('\n=== TEST 1: React hydration check ===');
  const hydrationCheck = await page.evaluate(() => {
    const rootEl = document.getElementById('__next');
    if (!rootEl) return 'No __next element found';

    // Check if React fiber is attached
    const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber'));
    return fiberKey ? 'React hydrated (fiber found)' : 'React NOT hydrated (no fiber)';
  });
  console.log(hydrationCheck);

  // Test 2: Check if the button has event listeners
  console.log('\n=== TEST 2: Button event listener check ===');
  const buttonCheck = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Session'));
    if (!btn) return 'Button not found';

    const fiberKey = Object.keys(btn).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
    const propsKey = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    const props = propsKey ? btn[propsKey] : null;

    return {
      found: true,
      hasFiber: !!fiberKey,
      hasProps: !!propsKey,
      hasOnClick: !!(props && props.onClick),
      disabled: btn.disabled,
      propsKeys: props ? Object.keys(props) : [],
    };
  });
  console.log(JSON.stringify(buttonCheck, null, 2));

  // Test 3: Add click listener to button and observe
  console.log('\n=== TEST 3: Manual click observation ===');
  await page.evaluate(() => {
    window.__clickLog = [];
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Session'));
    if (btn) {
      btn.addEventListener('click', (e) => {
        window.__clickLog.push({
          time: Date.now(),
          target: e.target.tagName,
          defaultPrevented: e.defaultPrevented,
          propagationStopped: false,
        });
      }, true); // Capture phase
    }
  });

  // Intercept fetch
  await page.evaluate(() => {
    window.__fetchLog = [];
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
      const method = args[1]?.method || 'GET';
      console.log(`FETCH INTERCEPTED: ${method} ${url}`);
      window.__fetchLog.push({ url, method, time: Date.now() });
      const resp = await origFetch.apply(this, args);
      window.__fetchLog.push({ url, method, status: resp.status, time: Date.now() });
      return resp;
    };
  });

  // Click the button
  console.log('Clicking "+ New Session" button...');
  const consoleBefore = consoleMessages.length;

  // Try clicking with Playwright
  await page.locator('button:has-text("+ New Session")').click();
  await sleep(500);

  // Check click log
  const clickLog = await page.evaluate(() => window.__clickLog);
  console.log('Click log:', JSON.stringify(clickLog));

  const fetchLog = await page.evaluate(() => window.__fetchLog);
  console.log('Fetch log:', JSON.stringify(fetchLog));

  const newConsole = consoleMessages.slice(consoleBefore);
  console.log('New console messages:');
  newConsole.forEach(m => console.log(`  [${m.type}] ${m.text}`));

  // Wait more
  await sleep(3000);
  const fetchLog2 = await page.evaluate(() => window.__fetchLog);
  console.log('Fetch log after 3.5s:', JSON.stringify(fetchLog2));

  // Check if creating state changed
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('Body text:', bodyText);

  // Check sessions via API
  const sessions = await page.evaluate(async () => {
    const origFetch = window.fetch;
    // Use the original fetch to avoid our interceptor logging noise
    const r = await origFetch.call(window, '/api/sessions');
    return r.json();
  });
  console.log('Sessions:', JSON.stringify(sessions, null, 2));

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07-test-v3.png'), fullPage: true });

  // Test 4: Try "Start your first session" button
  console.log('\n=== TEST 4: "Start your first session" button ===');

  // If there are sessions, the button won't be visible. Check.
  const startBtnVisible = await page.locator('button:has-text("Start your first session")').isVisible().catch(() => false);
  console.log('"Start your first session" visible:', startBtnVisible);

  if (startBtnVisible) {
    await page.locator('button:has-text("Start your first session")').click();
    await sleep(3000);
    const fetchLog3 = await page.evaluate(() => window.__fetchLog);
    console.log('Fetch log after "Start your first session" click:', JSON.stringify(fetchLog3));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08-after-start-btn.png'), fullPage: true });
    const bodyText2 = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('Body text after start click:', bodyText2);
  }

  // Test 5: Sidebar interactions
  console.log('\n=== TEST 5: Sidebar ===');
  // The sidebar shows "RUNNING PROCESSES" and "Scanning..."
  const sidebarText = await page.evaluate(() => {
    const sidebar = document.querySelector('aside') || document.querySelector('[class*="sidebar"]');
    return sidebar ? sidebar.innerText : 'No sidebar element found';
  });
  console.log('Sidebar text:', sidebarText);

  // Try the refresh button
  const refreshBtn = page.locator('button:has-text("↻")');
  if (await refreshBtn.isVisible()) {
    console.log('Clicking refresh button...');
    await refreshBtn.click();
    await sleep(2000);
    const sidebarText2 = await page.evaluate(() => {
      const sidebar = document.querySelector('aside') || document.querySelector('[class*="sidebar"]');
      return sidebar ? sidebar.innerText : 'No sidebar element found';
    });
    console.log('Sidebar text after refresh:', sidebarText2);
  }

  // Try collapse button
  const collapseBtn = page.locator('button:has-text("<")');
  if (await collapseBtn.isVisible()) {
    console.log('Clicking collapse button...');
    await collapseBtn.click();
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09-sidebar-collapsed.png'), fullPage: true });
    const bodyTextCollapsed = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Body text after collapse:', bodyTextCollapsed);

    // Try expand button (should be ">")
    const expandBtn = page.locator('button:has-text(">")');
    if (await expandBtn.isVisible()) {
      console.log('Clicking expand button...');
      await expandBtn.click();
      await sleep(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10-sidebar-expanded.png'), fullPage: true });
    }
  }

  // Test 6: Check WebSocket connection
  console.log('\n=== TEST 6: WebSocket connection check ===');
  const wsCheck = await page.evaluate(() => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      ws.onopen = () => {
        resolve({ connected: true, readyState: ws.readyState });
        ws.close();
      };
      ws.onerror = (e) => {
        resolve({ connected: false, error: 'WebSocket error' });
      };
      setTimeout(() => resolve({ connected: false, error: 'timeout' }), 3000);
    });
  });
  console.log('WebSocket test:', JSON.stringify(wsCheck));

  // Final cleanup: kill any sessions we created
  console.log('\n=== CLEANUP ===');
  const activeSessions = await page.evaluate(async () => {
    const r = await fetch('/api/sessions');
    return r.json();
  });
  for (const s of activeSessions) {
    console.log(`Killing session ${s.id} (pid ${s.pid})`);
    await page.evaluate(async (id) => {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    }, s.id);
  }

  console.log('\n\n========== COMPLETE REPORT ==========');
  const errors = consoleMessages.filter(m => m.type === 'error' || m.type === 'PAGE_ERROR');
  console.log(`Console errors: ${errors.length}`);
  errors.forEach(m => console.log(`  [${m.type}] ${m.text}`));
  console.log(`Screenshots in: ${SCREENSHOTS_DIR}`);

  await browser.close();
}

test().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});

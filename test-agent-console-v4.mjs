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

  // Navigate and wait
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);

  // Test: Is React hydrating? Check for __next or any root
  console.log('=== HYDRATION DEEP DIVE ===');
  const htmlDiag = await page.evaluate(() => {
    const body = document.body;
    const firstChild = body.firstElementChild;
    const result = {
      bodyChildCount: body.children.length,
      firstChildTag: firstChild?.tagName,
      firstChildId: firstChild?.id,
      firstChildClasses: firstChild?.className,
      hasReactRoot: !!document.querySelector('[data-reactroot]'),
      hasNextRoot: !!document.getElementById('__next'),
      allRootIds: Array.from(body.querySelectorAll('[id]')).map(el => el.id).slice(0, 20),
    };

    // Check all elements for React fiber
    let reactFiberCount = 0;
    document.querySelectorAll('*').forEach(el => {
      const keys = Object.keys(el);
      if (keys.some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps') || k.startsWith('__reactInternalInstance'))) {
        reactFiberCount++;
      }
    });
    result.reactFiberElements = reactFiberCount;

    // Check if React root is attached
    const rootEl = body.firstElementChild;
    if (rootEl) {
      const rootKeys = Object.keys(rootEl);
      result.rootReactKeys = rootKeys.filter(k => k.startsWith('__react') || k.startsWith('__next'));
    }

    return result;
  });
  console.log(JSON.stringify(htmlDiag, null, 2));

  // Check if the page is SSR'd without hydration
  console.log('\n=== SSR vs CSR check ===');
  const ssrCheck = await page.evaluate(() => {
    // If React hasn't hydrated, buttons won't have event handlers
    const buttons = document.querySelectorAll('button');
    const results = [];
    for (const btn of buttons) {
      const keys = Object.keys(btn);
      const reactKeys = keys.filter(k => k.startsWith('__react'));
      results.push({
        text: btn.innerText.substring(0, 30),
        reactKeys: reactKeys.length,
        hasNativeOnClick: !!btn.onclick,
        eventListenerCount: 'unknown', // Can't check with JS
      });
    }
    return results;
  });
  console.log(JSON.stringify(ssrCheck, null, 2));

  // Check the actual HTML for React scripts
  console.log('\n=== Script tags check ===');
  const scriptCheck = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    return Array.from(scripts).map(s => ({
      src: s.src?.substring(s.src.lastIndexOf('/') + 1) || '(inline)',
      type: s.type || 'default',
      async: s.async,
      defer: s.defer,
      hasContent: !!s.textContent,
    })).slice(0, 20);
  });
  console.log(JSON.stringify(scriptCheck, null, 2));

  // Wait longer for hydration
  console.log('\n=== Waiting 5 more seconds for hydration ===');
  await sleep(5000);

  const hydrationRetry = await page.evaluate(() => {
    let reactFiberCount = 0;
    document.querySelectorAll('*').forEach(el => {
      const keys = Object.keys(el);
      if (keys.some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'))) {
        reactFiberCount++;
      }
    });
    return { reactFiberElements: reactFiberCount };
  });
  console.log('After 7s total:', JSON.stringify(hydrationRetry));

  // Check if there are any JS errors that prevented hydration
  console.log('\n=== All console messages ===');
  consoleMessages.forEach(m => console.log(`  [${m.type}] ${m.text}`));

  // Test: Does the sidebar eventually load processes?
  console.log('\n=== Sidebar state after 7s ===');
  const sidebarState = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.innerText : 'No aside found';
  });
  console.log('Sidebar:', sidebarState);

  // Direct WebSocket test
  console.log('\n=== WebSocket /ws test ===');
  const wsTest = await page.evaluate(() => {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      const messages = [];
      ws.onopen = () => {
        messages.push('OPEN');
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          messages.push({ type: msg.type, payloadLength: Array.isArray(msg.payload) ? msg.payload.length : 'n/a' });
        } catch {
          messages.push('unparseable: ' + e.data.substring(0, 100));
        }
      };
      ws.onerror = () => messages.push('ERROR');
      ws.onclose = () => messages.push('CLOSE');
      setTimeout(() => {
        ws.close();
        resolve(messages);
      }, 2000);
    });
  });
  console.log('WS messages:', JSON.stringify(wsTest));

  // Also try to use the page's wsClient directly
  console.log('\n=== Direct wsClient module check ===');
  // The wsClient is a module singleton -- we can't easily access it from evaluate
  // But we can check if the WebSocket URL it's trying to connect to is correct
  const wsUrls = await page.evaluate(() => {
    // Check WebSocket prototype for any monitoring
    const wsInstances = [];
    // This won't capture existing instances but tells us about the environment
    return { locationHost: window.location.host };
  });
  console.log('Window location host:', wsUrls.locationHost);

  await browser.close();
  console.log('\n=== DONE ===');
}

test().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});

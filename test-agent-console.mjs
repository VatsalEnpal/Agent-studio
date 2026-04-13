import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/agent-console/test-screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  // Collect network requests
  const networkRequests = [];
  page.on('response', response => {
    networkRequests.push({
      url: response.url(),
      status: response.status(),
      method: response.request().method(),
    });
  });

  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  console.log('\n=== STEP 1: Navigate to http://localhost:8080 ===');
  try {
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Navigation successful');
  } catch (e) {
    console.log('Navigation error:', e.message);
  }

  console.log('\n=== STEP 2: Take screenshot of landing page ===');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-landing-page.png'), fullPage: true });
  console.log('Screenshot saved: 01-landing-page.png');

  // Get page title and visible text
  const title = await page.title();
  console.log('Page title:', title);

  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || 'No body text');
  console.log('Visible text (first 2000 chars):\n', bodyText);

  // Check page HTML structure
  const htmlLength = await page.evaluate(() => document.documentElement.outerHTML.length);
  console.log('HTML length:', htmlLength);

  console.log('\n=== STEP 3: Check console messages ===');
  if (consoleMessages.length === 0) {
    console.log('No console messages so far');
  } else {
    consoleMessages.forEach(m => console.log(`  [${m.type}] ${m.text}`));
  }

  console.log('\n=== STEP 3b: Check page errors ===');
  if (pageErrors.length === 0) {
    console.log('No page errors so far');
  } else {
    pageErrors.forEach(e => console.log(`  ERROR: ${e}`));
  }

  console.log('\n=== STEP 4: Check network requests ===');
  networkRequests.forEach(r => {
    const flag = r.status >= 400 ? ' [FAILED]' : '';
    console.log(`  ${r.method} ${r.url} -> ${r.status}${flag}`);
  });

  // Check for WebSocket connections
  const wsConnected = networkRequests.some(r => r.url.includes('ws') || r.url.includes('socket'));
  console.log('WebSocket-related request found:', wsConnected);

  console.log('\n=== STEP 5: Look for "+ New Session" button ===');

  // Try multiple selectors
  const selectors = [
    'button:has-text("New Session")',
    'button:has-text("new session")',
    'button:has-text("+")',
    '[data-testid="new-session"]',
    'button',
  ];

  let buttonFound = false;
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    console.log(`  Selector "${sel}": ${count} matches`);
    if (count > 0 && !buttonFound) {
      const texts = [];
      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await page.locator(sel).nth(i).innerText().catch(() => '(no text)');
        texts.push(text);
      }
      console.log(`  Button texts: ${JSON.stringify(texts)}`);
      buttonFound = true;
    }
  }

  // Find the New Session button specifically
  let newSessionBtn = page.locator('button:has-text("New Session")');
  let btnCount = await newSessionBtn.count();

  if (btnCount === 0) {
    // Try other patterns
    newSessionBtn = page.locator('button').filter({ hasText: /new\s*session/i });
    btnCount = await newSessionBtn.count();
  }

  if (btnCount === 0) {
    // Try any button with "+"
    newSessionBtn = page.locator('button').filter({ hasText: '+' });
    btnCount = await newSessionBtn.count();
    if (btnCount > 0) {
      console.log('Found button with "+" text');
    }
  }

  if (btnCount > 0) {
    console.log('\n=== STEP 6: Click the New Session button ===');
    const networkBefore = networkRequests.length;
    const consoleBefore = consoleMessages.length;

    await newSessionBtn.first().click();
    console.log('Button clicked');

    // Wait a moment for response
    await sleep(2000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-after-new-session-click.png'), fullPage: true });
    console.log('Screenshot saved: 02-after-new-session-click.png');

    console.log('\n=== STEP 7: Check console after click ===');
    const newConsoleMessages = consoleMessages.slice(consoleBefore);
    if (newConsoleMessages.length === 0) {
      console.log('No new console messages after click');
    } else {
      newConsoleMessages.forEach(m => console.log(`  [${m.type}] ${m.text}`));
    }

    console.log('\n=== STEP 8: Check network after click ===');
    const newNetworkRequests = networkRequests.slice(networkBefore);
    if (newNetworkRequests.length === 0) {
      console.log('No new network requests after click');
    } else {
      newNetworkRequests.forEach(r => {
        const flag = r.status >= 400 ? ' [FAILED]' : '';
        console.log(`  ${r.method} ${r.url} -> ${r.status}${flag}`);
      });
    }

    // Check specifically for POST /api/sessions
    const sessionPost = newNetworkRequests.find(r => r.method === 'POST' && r.url.includes('/api/sessions'));
    if (sessionPost) {
      console.log(`POST /api/sessions: ${sessionPost.status}`);
    } else {
      console.log('No POST /api/sessions request detected');
    }

    console.log('\n=== STEP 9: Wait 3 seconds ===');
    await sleep(3000);

    console.log('\n=== STEP 10: Take screenshot — check for terminal ===');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-after-wait.png'), fullPage: true });
    console.log('Screenshot saved: 03-after-wait.png');

    // Check for terminal-like elements
    const terminalSelectors = [
      '.xterm',
      '.terminal',
      '[data-testid="terminal"]',
      'canvas',
      '.xterm-screen',
      'textarea',
      'iframe',
    ];

    for (const sel of terminalSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`  Terminal element "${sel}": ${count} found`);
      }
    }

    // Check current body text
    const bodyTextAfter = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || 'No body text');
    console.log('Visible text after wait:\n', bodyTextAfter);

    console.log('\n=== STEP 11: Try typing in terminal ===');
    // Try to type in any input or terminal
    const inputCount = await page.locator('input, textarea').count();
    console.log(`Input/textarea count: ${inputCount}`);

    if (inputCount > 0) {
      await page.locator('input, textarea').first().click();
      await page.locator('input, textarea').first().type('hello');
      console.log('Typed "hello" into first input');
    } else {
      // Try keyboard type directly (for xterm)
      const xtermCount = await page.locator('.xterm').count();
      if (xtermCount > 0) {
        await page.locator('.xterm').first().click();
        await page.keyboard.type('hello');
        console.log('Typed "hello" into xterm terminal');
      } else {
        console.log('No input or terminal element found to type into');
        // Try clicking on the page and typing anyway
        await page.click('body');
        await page.keyboard.type('hello');
        console.log('Typed "hello" into body (fallback)');
      }
    }

    console.log('\n=== STEP 12: Final screenshot ===');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-final.png'), fullPage: true });
    console.log('Screenshot saved: 04-final.png');

  } else {
    console.log('\nCOULD NOT FIND "New Session" button. Taking diagnostic screenshot.');
    // List all interactive elements
    const allButtons = await page.locator('button').allTextContents();
    console.log('All button texts:', JSON.stringify(allButtons));

    const allLinks = await page.locator('a').allTextContents();
    console.log('All link texts:', JSON.stringify(allLinks));

    const allInputs = await page.locator('input').count();
    console.log('Input count:', allInputs);
  }

  console.log('\n\n========== SUMMARY ==========');
  console.log('Total console messages:', consoleMessages.length);
  console.log('Console errors:', consoleMessages.filter(m => m.type === 'error').length);
  console.log('Page errors:', pageErrors.length);
  console.log('Total network requests:', networkRequests.length);
  console.log('Failed requests (4xx/5xx):', networkRequests.filter(r => r.status >= 400).length);

  console.log('\nAll console errors:');
  consoleMessages.filter(m => m.type === 'error').forEach(m => console.log(`  ${m.text}`));

  console.log('\nAll page errors:');
  pageErrors.forEach(e => console.log(`  ${e}`));

  console.log('\nAll failed network requests:');
  networkRequests.filter(r => r.status >= 400).forEach(r => {
    console.log(`  ${r.method} ${r.url} -> ${r.status}`);
  });

  console.log('\nScreenshots saved to:', SCREENSHOTS_DIR);

  await browser.close();
}

test().catch(e => {
  console.error('Test script failed:', e.message);
  process.exit(1);
});

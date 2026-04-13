import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/test-screenshots/phase4';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function screenshot(page, name) {
  return page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
}

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(3000);

  // Create a session first
  const newBtn = await page.$('button:has-text("New Session")') || await page.$('button:has-text("Start your first session")');
  if (newBtn) {
    await newBtn.click();
    await sleep(500);
    const launchBtn = await page.$('button:has-text("Launch")');
    if (launchBtn) await launchBtn.click();
    await sleep(3000);
  }

  // === RETRY TEST 3: Fullscreen Escape ===
  console.log('=== RETRY: Fullscreen Escape ===');

  // First try: use the Maximize button instead of double-click
  const maxBtn = await page.$('button[title="Fullscreen"]');
  if (maxBtn) {
    await maxBtn.click();
    await sleep(500);
    await screenshot(page, 'retry-test3-fullscreen-via-button');

    // Check fullscreen state
    const isFullscreen = await page.evaluate(() => {
      return document.querySelectorAll('.fixed.inset-0.z-50').length > 0;
    });
    console.log(`  Fullscreen via button: ${isFullscreen}`);

    if (isFullscreen) {
      // Try Escape - click on body first to ensure focus is on the page, not inside xterm
      await page.evaluate(() => document.body.focus());
      await sleep(100);
      await page.keyboard.press('Escape');
      await sleep(500);

      const stillFullscreen = await page.evaluate(() => {
        return document.querySelectorAll('.fixed.inset-0.z-50').length > 0;
      });
      console.log(`  After Escape (body focus): still fullscreen = ${stillFullscreen}`);
      await screenshot(page, 'retry-test3-after-escape-body-focus');

      if (stillFullscreen) {
        // The issue might be that xterm captures the Escape key
        // Try clicking the "Exit" button instead
        const exitBtn = await page.$('button:has-text("Exit")');
        if (exitBtn) {
          await exitBtn.click();
          await sleep(500);
          const exitedFullscreen = await page.evaluate(() => {
            return document.querySelectorAll('.fixed.inset-0.z-50').length > 0;
          });
          console.log(`  After clicking Exit button: still fullscreen = ${exitedFullscreen}`);
          await screenshot(page, 'retry-test3-after-exit-btn');

          if (!exitedFullscreen) {
            console.log('  FINDING: Escape key doesn\'t exit fullscreen (xterm captures it), but Exit button works');
          }
        }

        // Also try clicking the backdrop
        // Re-enter fullscreen
        const maxBtn2 = await page.$('button[title="Fullscreen"]');
        if (maxBtn2) {
          await maxBtn2.click();
          await sleep(500);

          // Click the backdrop overlay
          const backdrop = await page.$('.animate-fade-in');
          if (backdrop) {
            await backdrop.click();
            await sleep(500);
            const afterBackdrop = await page.evaluate(() => {
              return document.querySelectorAll('.fixed.inset-0.z-50').length > 0;
            });
            console.log(`  After clicking backdrop: still fullscreen = ${afterBackdrop}`);
            await screenshot(page, 'retry-test3-after-backdrop-click');
          }
        }

        // Final attempt: dispatch Escape at window level
        const maxBtn3 = await page.$('button[title="Fullscreen"]');
        if (maxBtn3) {
          await maxBtn3.click();
          await sleep(500);
        }

        await page.evaluate(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true
          }));
        });
        await sleep(500);
        const afterDispatch = await page.evaluate(() => {
          return document.querySelectorAll('.fixed.inset-0.z-50').length > 0;
        });
        console.log(`  After dispatched Escape on window: still fullscreen = ${afterDispatch}`);
        await screenshot(page, 'retry-test3-after-dispatch-escape');
      }
    }
  } else {
    console.log('  No maximize button found');
  }

  // Exit any fullscreen state
  const exitBtn = await page.$('button:has-text("Exit")');
  if (exitBtn) await exitBtn.click();
  await sleep(500);

  // === RETRY TEST 7: Toast on Kill ===
  console.log('\n=== RETRY: Toast Notifications ===');

  // Make sure we have at least one session
  const sessions = await page.$$('.xterm');
  console.log(`  Sessions before kill: ${sessions.length}`);

  if (sessions.length > 0) {
    // Kill the session
    const killBtn = await page.$('button[title="Kill session"]');
    if (killBtn) {
      console.log('  Clicking kill button...');
      await killBtn.click();

      // Wait and check for toast immediately, multiple times
      for (let i = 0; i < 10; i++) {
        await sleep(300);
        const toastPresent = await page.evaluate(() => {
          // Check for toast container content
          const container = document.querySelector('.fixed.top-3.right-3');
          if (container && container.children.length > 0) {
            return container.innerText;
          }
          // Also look for any new toast elements
          const toasts = document.querySelectorAll('[class*="animate-toast"]');
          if (toasts.length > 0) return toasts[0].innerText;
          return null;
        });

        if (toastPresent) {
          console.log(`  Toast found at ${i * 300}ms: "${toastPresent}"`);
          await screenshot(page, 'retry-test7-toast-found');
          break;
        }

        if (i === 9) {
          console.log('  No toast found after 3 seconds');
          await screenshot(page, 'retry-test7-no-toast');
        }
      }

      // Also check: did the session actually get killed?
      await sleep(1000);
      const sessionsAfter = await page.$$('.xterm');
      console.log(`  Sessions after kill: ${sessionsAfter.length}`);

      // Check bottom bar for status
      const footerText = await page.$eval('footer', el => el.innerText).catch(() => 'no footer');
      console.log(`  Footer after kill: "${footerText.substring(0, 100)}"`);
    }
  } else {
    console.log('  No sessions available to kill');
  }

  // === ADDITIONAL: Check tab title updates ===
  console.log('\n=== ADDITIONAL: Tab title with attention ===');
  const title = await page.title();
  console.log(`  Tab title after session kill: "${title}"`);

  // Check favicon color
  const faviconHref = await page.evaluate(() => {
    const link = document.querySelector('link[rel="icon"]');
    return link ? link.href : 'not set';
  });
  console.log(`  Favicon after kill: ${faviconHref}`);
  await screenshot(page, 'retry-test6-after-kill');

  // === Check cost display ===
  console.log('\n=== ADDITIONAL: Cost display check ===');
  const costDisplay = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    if (!footer) return 'no footer';
    // Check center section of footer
    const spans = footer.querySelectorAll('span');
    for (const span of spans) {
      if (span.textContent.includes('$') && span.textContent.includes('total')) {
        return span.textContent;
      }
    }
    return 'no cost display (expected - cost is $0)';
  });
  console.log(`  Cost display: ${costDisplay}`);

  console.log('\n=== Console errors ===');
  console.log(`  Total: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log(`  ${e.substring(0, 150)}`);
  }

  await browser.close();
}

test().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});

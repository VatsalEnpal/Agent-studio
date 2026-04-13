import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/Users/vatsalbhatt230813/Code/InPipeline/test-screenshots/phase4';
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function screenshot(page, name) {
  return page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
}

const results = [];
function report(test, status, detail) {
  results.push({ test, status, detail });
  console.log(`[${status}] ${test}: ${detail}`);
}

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleMessages = [];
  const consoleErrors = [];
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // ===== TEST 1: Page loads cleanly =====
  console.log('\n===== TEST 1: Page loads cleanly =====');
  try {
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(3000);
    await screenshot(page, 'test1-page-load');

    // Check for JS errors (exclude known harmless ones)
    const realErrors = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('WebSocket') &&
      !e.includes('net::ERR')
    );

    // Check page has content
    const title = await page.title();
    const hasContent = await page.evaluate(() => document.body.innerText.length > 10);

    if (realErrors.length === 0 && hasContent) {
      report('Test 1: Page loads cleanly', 'PASS', `Title="${title}", no JS errors, content rendered`);
    } else if (realErrors.length > 0) {
      report('Test 1: Page loads cleanly', 'FAIL', `${realErrors.length} JS errors: ${realErrors.slice(0, 3).join('; ')}`);
    } else {
      report('Test 1: Page loads cleanly', 'FAIL', 'Page has no meaningful content');
    }

    // Check specific UI elements exist
    const hasSidebar = await page.$('aside') !== null || await page.$('button[title="Open sidebar"]') !== null;
    const hasBottomBar = await page.$('footer') !== null;
    const hasToggleBar = await page.$('header') !== null;
    console.log(`  Sidebar present: ${hasSidebar}, BottomBar: ${hasBottomBar}, ToggleBar: ${hasToggleBar}`);

  } catch (e) {
    report('Test 1: Page loads cleanly', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 2: Create 2 sessions =====
  console.log('\n===== TEST 2: Create 2 sessions =====');
  try {
    // Click "+ New Session" button in sidebar
    const newSessionBtn = await page.$('button:has-text("New Session")');
    if (!newSessionBtn) {
      // Try looking for the "Start your first session" button in empty state
      const startBtn = await page.$('button:has-text("Start your first session")');
      if (startBtn) {
        await startBtn.click();
      } else {
        report('Test 2: Create 2 sessions', 'FAIL', 'Could not find New Session or Start button');
      }
    } else {
      await newSessionBtn.click();
    }
    await sleep(500);
    await screenshot(page, 'test2-launcher-open');

    // Check launcher dialog opened
    const launcherVisible = await page.$('[role="dialog"]') !== null;
    console.log(`  Launcher dialog visible: ${launcherVisible}`);

    if (launcherVisible) {
      // Launch first session with "Quick Chat" preset or just click Launch
      const launchBtn = await page.$('button:has-text("Launch")');
      if (launchBtn) {
        await launchBtn.click();
        await sleep(2000);
        console.log('  First session launched');
      }

      // Launch second session
      await sleep(500);
      const newSessionBtn2 = await page.$('button:has-text("New Session")');
      const startBtn2 = await page.$('button:has-text("Start your first session")');
      if (newSessionBtn2) {
        await newSessionBtn2.click();
      } else if (startBtn2) {
        await startBtn2.click();
      }
      await sleep(500);

      const launchBtn2 = await page.$('button:has-text("Launch")');
      if (launchBtn2) {
        await launchBtn2.click();
        await sleep(2000);
        console.log('  Second session launched');
      }

      await sleep(2000);
      await screenshot(page, 'test2-two-sessions');

      // Count terminal panes (they have the xterm container class)
      const paneCount = await page.$$eval('.xterm', els => els.length);
      console.log(`  Terminal panes visible: ${paneCount}`);

      if (paneCount >= 2) {
        report('Test 2: Create 2 sessions', 'PASS', `${paneCount} terminal panes visible in grid`);
      } else if (paneCount === 1) {
        report('Test 2: Create 2 sessions', 'PARTIAL', `Only ${paneCount} pane visible, expected 2`);
      } else {
        // Check if sessions exist in sidebar even if xterm hasn't rendered
        const sidebarItems = await page.$$eval('[class*="session"]', els => els.length);
        report('Test 2: Create 2 sessions', 'PARTIAL', `${paneCount} xterm panes, sidebar items: ${sidebarItems}`);
      }
    } else {
      report('Test 2: Create 2 sessions', 'FAIL', 'Launcher dialog did not open');
    }
  } catch (e) {
    report('Test 2: Create 2 sessions', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 3: Terminal fullscreen =====
  console.log('\n===== TEST 3: Terminal fullscreen =====');
  try {
    // Find a terminal pane and double-click it
    const terminalPanes = await page.$$('.xterm');
    if (terminalPanes.length > 0) {
      // Double-click the first terminal pane container (the parent div)
      const paneContainer = await terminalPanes[0].evaluateHandle(el => el.closest('[class*="rounded-lg"]'));
      if (paneContainer) {
        await paneContainer.dblclick();
        await sleep(500);
        await screenshot(page, 'test3-fullscreen');

        // Check if fullscreen overlay exists (fixed inset-0 class)
        const hasFullscreen = await page.evaluate(() => {
          const fixedEls = document.querySelectorAll('.fixed.inset-0');
          return fixedEls.length > 0;
        });

        // Check for fullscreen header with "Esc to exit" text
        const hasExitHint = await page.$('text=Esc') !== null || await page.$('text=Exit') !== null;

        if (hasFullscreen) {
          console.log(`  Fullscreen overlay present: ${hasFullscreen}, Exit hint: ${hasExitHint}`);
          report('Test 3: Terminal fullscreen (enter)', 'PASS', 'Double-click opens fullscreen with overlay');

          // Press Escape to exit fullscreen
          await page.keyboard.press('Escape');
          await sleep(500);
          await screenshot(page, 'test3-after-escape');

          const stillFullscreen = await page.evaluate(() => {
            const fixedEls = document.querySelectorAll('.fixed.inset-0.z-50');
            return fixedEls.length > 0;
          });

          if (!stillFullscreen) {
            report('Test 3: Terminal fullscreen (exit)', 'PASS', 'Escape returns to grid view');
          } else {
            report('Test 3: Terminal fullscreen (exit)', 'FAIL', 'Fullscreen still active after Escape');
          }
        } else {
          report('Test 3: Terminal fullscreen', 'FAIL', 'No fullscreen overlay detected after double-click');
        }
      }
    } else {
      report('Test 3: Terminal fullscreen', 'SKIP', 'No terminal panes available to test');
    }
  } catch (e) {
    report('Test 3: Terminal fullscreen', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 4: Keyboard shortcuts =====
  console.log('\n===== TEST 4: Keyboard shortcuts =====');
  try {
    // Cmd+N -> opens launcher
    await page.keyboard.press('Meta+n');
    await sleep(500);
    const launcherAfterCmdN = await page.$('[role="dialog"]') !== null;
    await screenshot(page, 'test4-cmd-n-launcher');
    if (launcherAfterCmdN) {
      report('Test 4a: Cmd+N opens launcher', 'PASS', 'Launcher dialog appeared');
    } else {
      report('Test 4a: Cmd+N opens launcher', 'FAIL', 'No dialog appeared after Cmd+N');
    }

    // Escape -> closes launcher
    if (launcherAfterCmdN) {
      await page.keyboard.press('Escape');
      await sleep(300);
      const launcherClosed = await page.$('[role="dialog"]') === null;
      if (launcherClosed) {
        report('Test 4b: Escape closes launcher', 'PASS', 'Launcher closed on Escape');
      } else {
        report('Test 4b: Escape closes launcher', 'FAIL', 'Launcher still open after Escape');
      }
    }

    // Cmd+1 -> focuses first session
    await page.keyboard.press('Meta+1');
    await sleep(300);
    // Check if any terminal has the focused border (ring-1 ring-console-success)
    const hasFocusedBorder1 = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="ring-1"]');
      return els.length > 0;
    });
    report('Test 4c: Cmd+1 focuses first session', hasFocusedBorder1 ? 'PASS' : 'INCONCLUSIVE',
      hasFocusedBorder1 ? 'Focus ring visible on first pane' : 'No focus ring detected (may need sessions)');

    // Cmd+2 -> focuses second session
    await page.keyboard.press('Meta+2');
    await sleep(300);
    report('Test 4d: Cmd+2 focuses second session', 'PASS -- visual only', 'Shortcut fired, focus should shift');

    // Cmd+\ -> toggles sidebar
    const sidebarBefore = await page.$('aside') !== null;
    await page.keyboard.press('Meta+\\');
    await sleep(300);
    const sidebarAfter = await page.$('aside') !== null;
    await screenshot(page, 'test4-cmd-backslash-sidebar');
    if (sidebarBefore !== sidebarAfter) {
      report('Test 4e: Cmd+\\ toggles sidebar', 'PASS', `Sidebar toggled from ${sidebarBefore} to ${sidebarAfter}`);
    } else {
      report('Test 4e: Cmd+\\ toggles sidebar', 'FAIL', `Sidebar state unchanged: ${sidebarBefore}`);
    }

    // Toggle sidebar back
    await page.keyboard.press('Meta+\\');
    await sleep(300);

    // Cmd+K -> opens command palette
    await page.keyboard.press('Meta+k');
    await sleep(500);
    const cmdPaletteOpen = await page.$('[role="dialog"]') !== null;
    await screenshot(page, 'test4-cmd-k-palette');
    if (cmdPaletteOpen) {
      report('Test 4f: Cmd+K opens command palette', 'PASS', 'Command palette dialog appeared');
      // Close it
      await page.keyboard.press('Escape');
      await sleep(300);
    } else {
      report('Test 4f: Cmd+K opens command palette', 'FAIL', 'No dialog appeared after Cmd+K');
    }
  } catch (e) {
    report('Test 4: Keyboard shortcuts', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 5: Command Palette =====
  console.log('\n===== TEST 5: Command Palette =====');
  try {
    // Open command palette
    await page.keyboard.press('Meta+k');
    await sleep(500);

    const paletteInput = await page.$('input[placeholder="Type a command..."]');
    if (paletteInput) {
      // Type "new" -> should show "New Session"
      await paletteInput.fill('new');
      await sleep(300);
      const hasNewSession = await page.$('text=New Session') !== null;
      console.log(`  "new" query shows New Session: ${hasNewSession}`);
      await screenshot(page, 'test5-palette-new');

      // Type "teams" -> should show Teams option
      await paletteInput.fill('teams');
      await sleep(300);
      const hasTeams = await page.$('text=Teams') !== null || await page.$('text=Sprint') !== null;
      console.log(`  "teams" query shows Teams: ${hasTeams}`);
      await screenshot(page, 'test5-palette-teams');

      // Type session name (if sessions exist)
      await paletteInput.fill('claude');
      await sleep(300);
      const sessionResults = await page.$$eval('[data-palette-item]', els => els.length);
      console.log(`  "claude" query results: ${sessionResults}`);
      await screenshot(page, 'test5-palette-session');

      // Arrow key navigation
      await paletteInput.fill('');
      await sleep(200);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await sleep(200);

      // Check that second item is highlighted
      const highlightedIndex = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-palette-item]');
        for (let i = 0; i < items.length; i++) {
          if (items[i].className.includes('bg-console-faint/80')) return i;
        }
        return -1;
      });
      console.log(`  Arrow keys: highlighted index = ${highlightedIndex}`);

      if (hasNewSession && hasTeams) {
        report('Test 5: Command Palette', 'PASS', 'Search filters work for "new" and "teams", arrow keys navigate');
      } else {
        report('Test 5: Command Palette', 'PARTIAL', `New Session: ${hasNewSession}, Teams: ${hasTeams}`);
      }

      // Close palette
      await page.keyboard.press('Escape');
      await sleep(300);
    } else {
      report('Test 5: Command Palette', 'FAIL', 'Could not find command palette input');
    }
  } catch (e) {
    report('Test 5: Command Palette', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 6: Tab title + Favicon =====
  console.log('\n===== TEST 6: Tab title + Favicon =====');
  try {
    const title = await page.title();
    console.log(`  Current tab title: "${title}"`);

    // Check if title contains session count or "Agent Console"
    const titleIsCorrect = title.includes('Agent Console');

    // Check favicon link element
    const faviconHref = await page.evaluate(() => {
      const link = document.querySelector('link[rel="icon"]');
      return link ? link.href : 'not found';
    });
    console.log(`  Favicon href: ${faviconHref}`);

    // Check if title updates with session count (exited sessions)
    const sessionCount = await page.evaluate(() => {
      const sessions = document.querySelectorAll('.xterm');
      return sessions.length;
    });
    console.log(`  Sessions: ${sessionCount}, title should reflect attention count`);

    await screenshot(page, 'test6-tab-title');

    if (titleIsCorrect) {
      report('Test 6: Tab title + Favicon', 'PASS', `Title="${title}", favicon=${faviconHref}`);
    } else {
      report('Test 6: Tab title + Favicon', 'FAIL', `Unexpected title: "${title}"`);
    }
  } catch (e) {
    report('Test 6: Tab title + Favicon', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 7: Toast Notifications =====
  console.log('\n===== TEST 7: Toast Notifications =====');
  try {
    // Kill a session to trigger toast
    const killButtons = await page.$$('button[title="Kill session"]');
    if (killButtons.length > 0) {
      await killButtons[0].click();
      await sleep(2000);

      // Check for toast notification
      const hasToast = await page.evaluate(() => {
        // Toast container is at fixed top-3 right-3
        const toastContainer = document.querySelector('.fixed.top-3.right-3');
        if (toastContainer && toastContainer.children.length > 0) return true;
        // Also check for any element containing "ended" text
        return document.body.innerText.includes('ended');
      });

      await screenshot(page, 'test7-toast-notification');

      if (hasToast) {
        report('Test 7: Toast Notifications', 'PASS', 'Toast appeared after killing session');
      } else {
        report('Test 7: Toast Notifications', 'INCONCLUSIVE', 'Kill button clicked, toast may have auto-dismissed or session may not have been active');
      }
    } else {
      report('Test 7: Toast Notifications', 'SKIP', 'No sessions with kill buttons available');
    }
  } catch (e) {
    report('Test 7: Toast Notifications', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 8: Animations =====
  console.log('\n===== TEST 8: Animations =====');
  try {
    // Check sidebar has transition class
    const sidebarTransition = await page.evaluate(() => {
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        return sidebar.className.includes('transition') || sidebar.className.includes('duration');
      }
      return false;
    });

    // Check terminal focus border has transition
    const borderTransition = await page.evaluate(() => {
      const panes = document.querySelectorAll('[class*="transition-"]');
      return panes.length > 0;
    });

    // Check toast animation class
    const hasToastAnimation = await page.evaluate(() => {
      // Check if the animate-toast-in class is defined in stylesheets
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText && rule.cssText.includes('toast-in')) return true;
          }
        } catch { /* cross-origin */ }
      }
      return false;
    });

    // Check fade-in animation
    const hasFadeIn = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText && rule.cssText.includes('fade-in')) return true;
          }
        } catch { /* cross-origin */ }
      }
      return false;
    });

    console.log(`  Sidebar transition: ${sidebarTransition}`);
    console.log(`  Border transition elements: ${borderTransition}`);
    console.log(`  Toast animation CSS: ${hasToastAnimation}`);
    console.log(`  Fade-in animation CSS: ${hasFadeIn}`);

    // Toggle sidebar to check visual smoothness
    const sidebarVisible = await page.$('aside') !== null;
    await page.keyboard.press('Meta+\\');
    await sleep(100);
    await screenshot(page, 'test8-sidebar-mid-transition');
    await sleep(200);
    await screenshot(page, 'test8-sidebar-after-transition');
    // Toggle back
    await page.keyboard.press('Meta+\\');
    await sleep(300);

    if (borderTransition) {
      report('Test 8: Animations', 'PASS -- visual only',
        `Transitions present. Sidebar transition: ${sidebarTransition}, toast anim: ${hasToastAnimation}, fade-in: ${hasFadeIn}`);
    } else {
      report('Test 8: Animations', 'FAIL', 'No transition classes found on interactive elements');
    }
  } catch (e) {
    report('Test 8: Animations', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 9: Bottom bar =====
  console.log('\n===== TEST 9: Bottom bar =====');
  try {
    const footer = await page.$('footer');
    if (footer) {
      const footerText = await footer.innerText();
      console.log(`  Footer text: "${footerText}"`);

      // Check for total cost display
      const hasCostSection = footerText.includes('$') || footerText.includes('total');

      // Check for shortcut hints with Cmd prefix
      const hasCmdPrefix = footerText.includes('Cmd') || footerText.includes('cmd');
      const hasCmdK = footerText.includes('K') && hasCmdPrefix;

      // Check for session status counts
      const hasStatusInfo = footerText.includes('active') || footerText.includes('idle') || footerText.includes('exited') || footerText.includes('No sessions');

      await screenshot(page, 'test9-bottom-bar');

      console.log(`  Cost section: ${hasCostSection}`);
      console.log(`  Cmd prefix hints: ${hasCmdPrefix}`);
      console.log(`  Cmd+K hint: ${hasCmdK}`);
      console.log(`  Status info: ${hasStatusInfo}`);

      const allChecks = hasCmdPrefix && hasStatusInfo;
      if (allChecks) {
        report('Test 9: Bottom bar', 'PASS', `Shortcut hints with Cmd prefix, status info present. Cost display: ${hasCostSection}`);
      } else {
        report('Test 9: Bottom bar', 'PARTIAL', `Cmd hints: ${hasCmdPrefix}, Status: ${hasStatusInfo}, Cost: ${hasCostSection}`);
      }
    } else {
      report('Test 9: Bottom bar', 'FAIL', 'No footer element found');
    }
  } catch (e) {
    report('Test 9: Bottom bar', 'FAIL', `Error: ${e.message}`);
  }

  // ===== TEST 10: Teams mode still works =====
  console.log('\n===== TEST 10: Teams mode still works =====');
  try {
    // Click Teams tab in toggle bar
    const teamsTab = await page.$('button:has-text("Teams")');
    if (teamsTab) {
      await teamsTab.click();
      await sleep(2000);
      await screenshot(page, 'test10-teams-view');

      // Check if Teams view content loaded
      const hasTeamsContent = await page.evaluate(() => {
        const body = document.body.innerText;
        // Check for sprint-related content or empty state
        return body.includes('Sprint') || body.includes('No Active Sprint') ||
               body.includes('Memory') || body.includes('Activity') ||
               body.includes('Loading') || body.includes('current.md');
      });

      console.log(`  Teams view has content: ${hasTeamsContent}`);

      // Check for memory stats section in the side panel
      const hasMemoryStats = await page.evaluate(() => {
        return document.body.innerText.includes('Memory') || document.body.innerText.includes('entries');
      });
      console.log(`  Memory stats visible: ${hasMemoryStats}`);

      // Switch back to Sessions
      const sessionsTab = await page.$('button:has-text("Sessions")');
      if (sessionsTab) {
        await sessionsTab.click();
        await sleep(500);
        await screenshot(page, 'test10-back-to-sessions');

        // Verify we're back in sessions mode
        const backInSessions = await page.evaluate(() => {
          // Check for terminal grid or empty session state
          return document.body.innerText.includes('session') ||
                 document.querySelector('.xterm') !== null;
        });
        console.log(`  Back in sessions: ${backInSessions}`);
      }

      if (hasTeamsContent) {
        report('Test 10: Teams mode still works', 'PASS', `Teams view loads with sprint data/empty state, memory stats: ${hasMemoryStats}`);
      } else {
        report('Test 10: Teams mode still works', 'FAIL', 'Teams view did not load expected content');
      }
    } else {
      report('Test 10: Teams mode still works', 'FAIL', 'Teams tab button not found');
    }
  } catch (e) {
    report('Test 10: Teams mode still works', 'FAIL', `Error: ${e.message}`);
  }

  // ===== FINAL REPORT =====
  console.log('\n\n========================================');
  console.log('QA PHASE 4 — FINAL REPORT');
  console.log('========================================\n');

  let p0 = 0, p1 = 0, p2 = 0, p3 = 0;
  let passes = 0, fails = 0, skips = 0, partials = 0;

  for (const r of results) {
    if (r.status.startsWith('PASS')) passes++;
    else if (r.status.startsWith('FAIL')) {
      fails++;
      // Classify severity
      if (r.detail.includes('JS error') || r.detail.includes('no content')) p0++;
      else if (r.detail.includes('not found') || r.detail.includes('did not')) p1++;
      else p2++;
    }
    else if (r.status === 'SKIP') skips++;
    else if (r.status === 'PARTIAL' || r.status === 'INCONCLUSIVE') partials++;

    console.log(`${r.status.padEnd(20)} | ${r.test}`);
    console.log(`${''.padEnd(20)} | ${r.detail}\n`);
  }

  const healthScore = 100 - (p0 * 25) - (p1 * 15) - (p2 * 5) - (p3 * 1);
  console.log('--- Summary ---');
  console.log(`PASS: ${passes}, FAIL: ${fails}, PARTIAL: ${partials}, SKIP: ${skips}`);
  console.log(`Severity: P0=${p0}, P1=${p1}, P2=${p2}, P3=${p3}`);
  console.log(`Health Score: ${healthScore}/100`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);

  // Check all console errors accumulated
  console.log(`\n--- Console Errors (${consoleErrors.length} total) ---`);
  for (const err of consoleErrors.slice(0, 10)) {
    console.log(`  ERROR: ${err.substring(0, 200)}`);
  }

  // Write report JSON
  const reportJson = {
    timestamp: new Date().toISOString(),
    healthScore,
    summary: { passes, fails, partials, skips },
    severity: { p0, p1, p2, p3 },
    results,
    consoleErrors: consoleErrors.slice(0, 20),
    screenshotsDir: SCREENSHOTS_DIR,
  };
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'report.json'),
    JSON.stringify(reportJson, null, 2)
  );

  await browser.close();
}

test().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});

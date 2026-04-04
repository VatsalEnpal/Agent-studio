const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  console.log('Loading app...');
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000); // Wait for hydration
  
  console.log('Taking Sessions screenshot...');
  await page.screenshot({ path: '/tmp/as-sessions.png', fullPage: false });
  
  // Check what's visible on the page
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Page text:', bodyText.slice(0, 200));
  
  // Check for errors in console
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('Console error:', msg.text().slice(0, 100));
  });
  
  // Try clicking Rooms nav
  try {
    const navItems = await page.locator('[data-page]').all();
    console.log('Nav items found:', navItems.length);
    
    // Try different selectors for nav
    const buttons = await page.locator('button, [role="button"], nav a').all();
    console.log('Buttons found:', buttons.length);
    for (const btn of buttons.slice(0, 10)) {
      const text = await btn.innerText().catch(() => '');
      const title = await btn.getAttribute('title').catch(() => '');
      if (text || title) console.log(`  Button: "${text || title}"`);
    }
  } catch (e) {
    console.log('Nav error:', e.message);
  }
  
  // Get all visible text sections
  const sections = await page.evaluate(() => {
    const els = document.querySelectorAll('h1, h2, h3, [class*="title"], [class*="header"]');
    return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean).slice(0, 10);
  });
  console.log('Sections:', sections);
  
  await browser.close();
  console.log('Screenshots saved to /tmp/as-*.png');
})();

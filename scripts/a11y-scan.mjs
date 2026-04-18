#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * a11y-scan.mjs — lightweight accessibility scan for Agent Studio.
 *
 * Runs axe-core against the main tabs (Sessions, Teams, Sprints, Memory,
 * Settings) of the app running on :8080 and writes the violations to
 * `.shiploop/a11y-report.json`. Exits non-zero if any `serious` or `critical`
 * violations are found, so this can be wired into CI later.
 *
 * Usage:
 *   npm run dev    # in another terminal
 *   npm run a11y
 *
 * Design notes:
 * - We use Playwright (already a devDep) + the axe-core browser build
 *   (node_modules/axe-core/axe.min.js) injected via `page.addScriptTag`.
 *   No extra axe-playwright wrapper dep.
 * - We drive tab switching via the ToggleBar's zustand store
 *   (useUIStore.setActiveMode) exposed via `window`, falling back to
 *   a visible-button click when no store hook is found.
 * - Violations are grouped by severity. The script prints a summary and
 *   exits 1 only for serious/critical — minor/moderate is informational.
 */

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AXE_PATH = join(ROOT, "node_modules", "axe-core", "axe.min.js");
const REPORT_DIR = join(ROOT, ".shiploop");
const REPORT_PATH = join(REPORT_DIR, "a11y-report.json");
const BASE_URL = process.env.A11Y_BASE_URL || "http://localhost:8080";

const TABS = [
  { id: "sessions", label: "Sessions" },
  { id: "teams", label: "Teams" },
  { id: "sprints", label: "Sprints" },
  { id: "memory", label: "Memory" },
  { id: "settings", label: "Settings" },
];

async function ensureServerUp() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${BASE_URL}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    if (body?.status !== "ok") throw new Error("health not ok");
  } catch (err) {
    console.error(
      `\n[a11y] Agent Studio server is not reachable at ${BASE_URL}.\n` +
        `       Start it in another terminal with \`npm run dev\` and re-run.\n` +
        `       (reason: ${err instanceof Error ? err.message : String(err)})\n`,
    );
    process.exit(2);
  }
}

async function dismissOverlays(page) {
  // A setup wizard modal or similar overlay can intercept clicks on a fresh
  // config. Close any dialog with role=dialog if present, and try Escape.
  await page.keyboard.press("Escape").catch(() => {});
  const dialogClose = page
    .locator('[role="dialog"] button[aria-label="Close" i], [role="dialog"] button:has-text("Skip"), [role="dialog"] button:has-text("Cancel")')
    .first();
  if (await dialogClose.count().catch(() => 0)) {
    await dialogClose.click({ timeout: 1500 }).catch(() => {});
  }
}

async function switchTab(page, tabId) {
  await dismissOverlays(page);
  // Each tab button has `data-nav="<id>"` in the rail, or an aria-label.
  // Try several selector strategies.
  const label = TABS.find((t) => t.id === tabId)?.label ?? tabId;
  const candidates = [
    page.locator(`[data-nav="${tabId}"]`).first(),
    // knowledge is the internal data-nav name for the memory tab
    tabId === "memory" ? page.locator(`[data-nav="knowledge"]`).first() : null,
    page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first(),
    page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).first(),
  ].filter(Boolean);

  let clicked = false;
  for (const c of candidates) {
    try {
      if (await c.count()) {
        await c.click({ timeout: 2500, force: true });
        clicked = true;
        break;
      }
    } catch {
      /* try next candidate */
    }
  }
  if (!clicked) {
    console.warn(`[a11y] could not activate tab "${tabId}" — scanning current view anyway`);
  }
  // Give the crossfade animation + data fetching a moment.
  await page.waitForTimeout(600);
}

async function runAxeOnPage(page) {
  const axeSource = readFileSync(AXE_PATH, "utf-8");
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    if (!w.axe) throw new Error("axe not injected");
    /** @type {any} */
    const results = await w.axe.run(document, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return {
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          html: n.html,
          failureSummary: n.failureSummary,
        })),
      })),
    };
  });
}

function severityOf(violation) {
  // axe impacts: minor | moderate | serious | critical (or null)
  return violation.impact || "moderate";
}

async function main() {
  await ensureServerUp();

  mkdirSync(REPORT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const perTab = [];
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    for (const tab of TABS) {
      await switchTab(page, tab.id);
      const axeResult = await runAxeOnPage(page);
      perTab.push({ tab: tab.id, label: tab.label, ...axeResult });
      console.log(
        `[a11y] ${tab.label.padEnd(10)}  violations: ${axeResult.violations.length}`,
      );
    }
  } finally {
    await browser.close();
  }

  // Aggregate by severity.
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const uniqueRules = new Set();
  for (const tabResult of perTab) {
    for (const v of tabResult.violations) {
      const s = severityOf(v);
      bySeverity[s] = (bySeverity[s] || 0) + 1;
      uniqueRules.add(v.id);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary: { bySeverity, uniqueRules: [...uniqueRules] },
    perTab,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`\n[a11y] report written to ${REPORT_PATH}`);
  console.log(
    `[a11y] summary — critical: ${bySeverity.critical}, serious: ${bySeverity.serious}, ` +
      `moderate: ${bySeverity.moderate}, minor: ${bySeverity.minor}`,
  );

  if (bySeverity.critical > 0 || bySeverity.serious > 0) {
    console.error("[a11y] FAIL — critical or serious violations present.");
    process.exit(1);
  }
  console.log("[a11y] OK — no critical/serious violations.");
}

main().catch((err) => {
  console.error("[a11y] scan failed:", err);
  process.exit(1);
});

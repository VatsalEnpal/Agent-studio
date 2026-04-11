# Agent Studio — Complete Knowledge Base

Everything learned from the April 11, 2026 deep research session. This document contains ALL research findings, tool recommendations, architecture decisions, and implementation details. Not a summary — the actual substance.

---

## 1. THE PROBLEM

Agent Studio is a v0.1 prototype being used as a daily tool. Features get added fast but stability drops. Specific issues:
- Rooms break half the time (Close Room sends SIGTERM but no wait/SIGKILL fallback → zombie PTY processes)
- Terminals break (every byte broadcasts to ALL WebSocket clients, execSync blocks event loop)
- Agent Tasks: click does nothing (silent fetch failure, no error UI)
- Sprint breaks (file-based markdown parsing with no validation)
- Sessions break (per-pane polling: 6 panes × 15s + server polling 3s/10s/30s = 100+ FS reads/min)
- Not logical / not well thought out (no input validation, no error boundaries per panel, no graceful degradation)

---

## 2. THE INDUSTRY CONTEXT (April 2026)

### Karpathy's Evolution
- Feb 2025: Coined "vibe coding" — accept AI output without review
- Feb 4, 2026: Declared vibe coding "passe," proposed "agentic engineering" — AI agents write/test code under active human direction
- Dec 2025: "Coding agents basically didn't work before December and basically work since"
- His workflow: several Claude windows on left, IDE on right for review. Tab completion (~75% of LLM help), agents for bigger tasks
- Key repos: autoresearch (70k stars), nanochat (51k), llm-council (16k)
- LLM Wiki pattern: Obsidian as IDE, LLM as programmer, wiki as codebase

### The Quality Gap (CircleCI 2026 Report)
- Teams produce 15% MORE code but ship 7% LESS to production
- Main branch success rate: 70.8% (below 90% benchmark)
- Recovery time: 72 minutes (up 13%)
- AI amplifies existing strengths — strong teams get stronger, weak teams get weaker

### Key People & What They Say
- **Boris Cherny** (Claude Code creator): "The most important thing is giving Claude a way to verify its work — it will 2-3x the quality"
- **Addy Osmani** (Google): "Comprehension Debt" — 5-7x velocity-comprehension gap. Active engagement > passive delegation
- **Guillermo Rauch** (Vercel): "Vibe coding vs vibe engineering" — operate on the product vs operate on the code
- **Frank Neff**: "Turn every bug caught in review into an automated rule"
- **Baymard Institute**: Narrow LLM classification + deterministic rules = 95% accuracy. Open-ended "what's wrong?" = 50-75%

### The Stats
- 45% of AI-generated code contains security flaws
- 35 CVEs attributed to AI-generated code in March 2026 alone
- AI-coauthored PRs contain 1.7x more issues (CodeRabbit Dec 2025)
- 60% of AI-generated code requires intervention
- Veracode: AI code contains 2.74x more vulnerabilities than human-written

---

## 3. THE TOOLS LANDSCAPE

### Claude Code Skills

| Tool | Stars | What it does | URL |
|------|-------|-------------|-----|
| **Superpowers** (obra) | 30k+ | TDD, verification, debugging, brainstorming, plans | github.com/obra/superpowers |
| **Plankton** (alexfazio) | Active | Write-time quality: 20+ linters on every edit, 3-phase pipeline | github.com/alexfazio/plankton |
| **TDD Guard** (nizos) | 2k+ | Blocks implementation without failing tests | github.com/nizos/tdd-guard |
| **Claudekit** (carlrannaberg) | Active | Auto-checkpointing, lazy-code detection, 6-aspect review | github.com/carlrannaberg/claudekit |
| **Ralph** (frankbria) | Active | Autonomous loop with circuit breaker, 566 tests | github.com/frankbria/ralph-claude-code |
| **Everything Claude Code** (affaan-m) | 150k+ | verification-loop, tdd-workflow, e2e-testing, autonomous-loops | github.com/affaan-m/everything-claude-code |
| **Antigravity Skills** (sickn33) | 32k | 1,370+ skills, QA & Testing pack, kaizen | github.com/sickn33/antigravity-awesome-skills |
| **gstack** (garrytan) | Active | CEO/Designer/QA/Release Manager agents, /qa command | github.com/garrytan/gstack |

### MCP Servers

| Server | What it does | Install |
|--------|-------------|---------|
| **Playwright MCP** (Microsoft) | Browser testing, 25+ tools, accessibility tree | `claude mcp add playwright npx @playwright/mcp@latest` |
| **Sentry MCP** (getsentry) | Error tracking, zero install, OAuth | Remote at `https://mcp.sentry.dev/mcp` |
| **SonarQube MCP** (SonarSource) | Static analysis in agent loop | Docker container |
| **ESLint MCP** | Lint analysis as tool call | `npx @eslint/mcp@latest` |
| **Datadog MCP** | Full observability, 16+ tools | Remote server, GA March 2026 |

### Hooks — The Enforcement Layer

**CRITICAL FINDING**: CLAUDE.md rules get followed ~70% of time. Under pressure, <30%. Hooks close to 100% because they're shell commands.

Exit codes: 2 = block action, 1 = warn, 0 = proceed.

**The 3 most impactful hooks:**
1. PostToolUse on Edit/Write — auto-format + run related tests after every edit
2. Stop — blocks completion unless typecheck + lint + build + tests pass
3. PreToolUse on Bash — blocks destructive commands, enforces lint before commit

**Critical: `stop_hook_active` flag** — MUST check in Stop hooks or infinite loop. On second attempt, let Claude stop.

**Hook types**: command (deterministic), prompt (single LLM call), agent (multi-turn subagent with tool access)

**Best examples from real users:**
- ChrisWiles/claude-code-showcase — complete production settings.json
- Blake Crosley — 5 production hooks tutorial (blakecrosley.com)
- claudefa.st — stop hook test gate with infinite loop prevention
- Alexander Opalic — forced TDD via UserPromptSubmit hook (skill activation went from 20% to 84%)

### Reference Architectures (Agent Desktop Apps)

| Project | Stack | Why it matters |
|---------|-------|---------------|
| **Dorothy** | Electron + React/Next.js + node-pty | Closest analog — orchestrates Claude/Codex/Gemini agents |
| **Accomplish** | Electron + React + Vite + Zustand | Cleanest architecture — monorepo pattern |
| **Hyper** (Vercel) | Electron + React + Redux + xterm.js | Gold standard for terminal integration |
| **Tabby** | Electron + electron-builder + node-pty | Best reference for node-pty packaging |
| **Goose** (Block) | Desktop + CLI | 27k stars, 350+ contributors, early MCP adopter |

---

## 4. QUALITY ENFORCEMENT ARCHITECTURE

### Three Layers

```
ENFORCEMENT (prevents bugs from being written)
├── Superpowers skills (brainstorm → plan → TDD → verify)
├── Hooks (auto-format, lint, test gate on Stop, typecheck before commit)
├── TypeScript strict flags (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
└── Branch protection (block edits on main)

DETECTION (catches bugs that slip through)
├── Playwright E2E tests (critical paths)
├── Vitest unit tests (state management, server logic)
├── SonarQube / ESLint MCP (static analysis in the loop)
└── Visual regression (Percy, Playwright screenshots)

MONITORING (sees bugs in production)
├── Sentry for Electron (crash reporting + perf)
└── Sentry MCP (Claude can investigate errors)
```

### The Self-Correcting Loop

```
Claude edits file → PostToolUse formats + typechecks + runs related test →
Claude tries to stop → Stop hook runs typecheck + lint + build + tests →
Fails? → "block" → Claude forced to fix → tries to stop again →
Passes? → Claude can finish
```

### Spec-Driven Development
Thoughtworks called this "the most important practice to emerge in 2025."
Flow: Specify → Plan → Tasks → Implement
Tools: Pimzino/claude-code-spec-workflow, gotalab/cc-sdd
Pattern: brainstorming → writing-plans → executing-plans (Superpowers chain)

---

## 5. QA LOOP ARCHITECTURE

### The Three-Agent Pattern (from Anthropic's harness)

**TESTER** (Playwright MCP, NO source code access): Navigates app like a user. Screenshots every view. Tests buttons, forms, flows. Checks empty/error/loading states.

**FIXER** (full code access): Takes bug reports. Reads code. Fixes issues. Writes tests. Runs typecheck + build.

**JUDGE** (checklist, narrow questions): Asks 10 specific yes/no questions per screen. Scores pass/fail per feature. NOT open-ended "what's wrong?"

### The 10-Point Product Checklist (Per Feature)

1. Happy path works
2. Empty state has helpful message + CTA
3. Loading state shows skeleton/spinner
4. Error state shows actionable message
5. Keyboard navigation works (Tab, Enter, Escape)
6. No console errors
7. No layout shift on data load
8. Overflow text handled (truncation/wrapping)
9. Destructive actions need confirmation
10. Back/undo returns to sensible state

### How to Run the Loop

**Ralph Loop** (simplest):
```
/ralph-loop "QA Agent Studio at localhost:8080. Use Playwright MCP. Test every feature against 10-point checklist. Fix bugs. Re-test. Track in test_state.json. Output ALL_FEATURES_PASS when done." --max-iterations 30
```

**Harness Pattern** (most thorough):
1. Start app: `npm run dev`
2. Tester: `claude --agent qa-tester -p "Test at localhost:8080. Screenshot every view. Report to bugs.json. Do NOT read source."`
3. Fixer: `claude -p "Read bugs.json. Fix each bug. Write test. Run typecheck + build. Update status."`
4. Repeat until all RESOLVED

**Key repos for QA loops:**
- frankbria/ralph-claude-code — autonomous loop with circuit breaker
- celesteanders/harness — Anthropic-style generator/evaluator
- vercel-labs/agent-browser — dogfood skill (test like a user, no source code)
- lackeyjb/playwright-skill — on-the-fly Playwright automation
- AnandChowdhary/continuous-claude — loop + PRs + CI checks

### Visual QA Tools

| Tool | Type | Cost | Best for |
|------|------|------|----------|
| Playwright MCP | Browser control | Free | Everything (already configured) |
| Playwright Test Agents | Auto-generate tests | Free | `npx playwright init-agents` |
| Percy | Visual regression | Free tier 5k/mo | CI/CD regression |
| Meticulous.ai | Session replay + AI | Paid | WebSocket/real-time flows |
| Momentic | AI autonomous testing | Paid | Plain-English test creation |
| Bug0 Studio | AI + human QA | $250/mo | Full QA outsource |
| Applitools Eyes | Visual AI | Free tier 100/mo | Cross-browser visual |
| axe DevTools | Accessibility | Free | WCAG compliance |

### UX Evaluation (Baymard Pattern — 95% accuracy)

**WRONG**: "Look at this screenshot. What UX issues do you see?" → 50-75% accuracy
**RIGHT**: "Is there a loading indicator visible? [yes/no]" + rule: "no indicator during loading = HIGH severity" → 95% accuracy

Pattern: narrow classification (LLM) + deterministic evaluation (rules) = reliable results

---

## 6. MAC APP DISTRIBUTION

### Packaging Decision: Electron

Electron is the only viable path because:
- node-pty needs Node.js native modules (Tauri can't without Rust rewrite)
- Tauri + Next.js requires `output: 'export'` (Agent Studio uses Express custom server)
- Your existing Express + WebSocket + Next.js stack maps directly to Electron

### Architecture
```
Electron Main Process
├── Express server (embedded)
├── node-pty (ASAR-unpacked)
└── WebSocket server (ws)

Electron Renderer Process
├── Next.js (loaded via custom server)
├── xterm.js
└── Zustand
```

### Packaging Details
- Use **Electron Forge** (officially blessed by Electron team)
- `@electron-forge/plugin-auto-unpack-natives` for node-pty
- node-pty has TWO parts: C++ addon (.node file) + spawn-helper binary — BOTH must be outside ASAR
- Alternative: `@homebridge/node-pty-prebuilt-multiarch` for prebuilt binaries
- Reference: Tabby terminal (github.com/Eugeny/tabby) for node-pty packaging

### Release Phases
1. **Phase 1**: Release as CLI — `npm install && npm start` on port 8080. Works immediately.
2. **Phase 2**: Electron wrapper — DMG/AppImage/EXE via GitHub Releases
3. **Phase 3**: Apple code signing ($99/yr), auto-updates, Homebrew Cask

### GitHub Release Checklist
- README with demo GIF (use VHS or Kap for recording)
- LICENSE (MIT)
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- Issue templates (bug report, feature request)
- GitHub Actions CI (build on macOS/Linux/Windows runners)
- semantic-release for automated versioning
- Homebrew Cask formula for easy install

---

## 7. WHAT WAS BUILT (in ~/Code/AgentStudio/)

### Project Setup
- Standalone git repo at `~/Code/AgentStudio/` (separate from InPipeline/Azure)
- Code copied from `agent-console/` in InPipeline
- Own `.git/` → Claude Code treats it as separate project
- `.gitignore` separates GitHub (product code only) from local (QA, hooks, tools)

### Quality Infrastructure (all in .claude/, local only)

**6 hooks:**
1. `session-start.sh` — re-injects CURRENT_STATE.md after compaction
2. `post-edit-format.sh` — Prettier/Biome format + ESLint lint + run related test (3-phase)
3. `post-edit-typecheck.sh` — tsc --noEmit + lazy-code pattern detection
4. `stop-verify.sh` — 4-gate: typecheck → lint → build → unit tests (blocks if any fail)
5. `pre-bash-safety.sh` — blocks force-push, reset --hard, rm -rf, push to main, + typecheck before commit
6. `protect-files.sh` — blocks .env, credentials, lock files, git internals, blocks edits on main branch

**3 slash commands:**
1. `/bug-to-rule` — fix bug → write test → add lint rule → update docs
2. `/verify` — full quality gate suite with pass/fail per gate
3. `/stabilize` — systematic debugging: investigate → categorize → fix → harden

**TypeScript strict flags added to tsconfig.json:**
- `noUncheckedIndexedAccess: true` — forces null checks on array/object access
- `exactOptionalPropertyTypes: true` — distinguishes missing from undefined
- `noFallthroughCasesInSwitch: true` — catches missing break in switch

**Other files:**
- `CLAUDE.md` — 80 lines, architecture + commands + fragile areas + patterns + testing workflow
- `CURRENT_STATE.md` — what works, what's broken, do not modify, current task
- `.claudeignore` — excludes node_modules, screenshots, logs from context
- `.mcp.json` — Playwright MCP configured
- `.claude/settings.json` — full hook wiring + permissions (allow/deny)

### GitHub vs Local Split

**Goes to GitHub:** src/, server/, tests/*.spec.ts, package.json, README, LICENSE, DESIGN, HOWTO, Dockerfile, playwright.config.ts, tsconfig.json

**Stays local:** .claude/, CLAUDE.md, .claudeignore, .mcp.json, CURRENT_STATE.md, qa-screenshots/, test-screenshots/, qa-*.mjs, test-*.mjs, PLAN.md, PM_REVIEW.md, ARCHITECTURE_REVIEW.md, ai-agents/

---

## 8. TODO — WHAT'S NEXT

### Immediate (before starting QA loop)
- [ ] Install Ralph Loop plugin: `/plugin install ralph-loop@claude-plugins-official`
- [ ] Install Playwright Test Agents: `npx playwright init-agents`
- [ ] Install agent-browser dogfood skill: `npx skills add vercel-labs/agent-browser --skill dogfood`
- [ ] Create QA tester agent at `.claude/agents/qa-tester.md`
- [ ] Create `test_state.json` tracking all features pass/fail
- [ ] Run `npm install` in AgentStudio
- [ ] Verify hooks work by making a test edit

### Port to InPipeline (office work)
- [ ] Stop hook (typecheck before "done")
- [ ] .claudeignore (reduce context noise)
- [ ] SessionStart compaction hook (preserve context after /compact)

### For GitHub Release
- [ ] README with demo GIF
- [ ] CONTRIBUTING.md
- [ ] GitHub Actions CI workflow
- [ ] Electron wrapper (Phase 2)
- [ ] Homebrew Cask formula (Phase 3)

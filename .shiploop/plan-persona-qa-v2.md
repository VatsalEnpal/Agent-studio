# ShipLoop — Persona QA v2 (Post-Workflow Engine)

> Exhaustive persona-based testing of Agent Studio after the workflow engine build.
> Tests EVERYTHING: old features, new workflow engine, regressions, edge cases.
> 4 personas, 750+ interactions each, 150+ screenshots each.
> Uses ShipLoop brain pattern: work subagent tests, verify subagent validates.
> Do NOT stop until ALL tasks show [DONE].

## How This Works — ShipLoop Brain Pattern

You are the COORDINATOR. You do NOT test the app yourself. For each persona:

1. **Dispatch a WORK subagent** (Agent tool) that:
   - Starts the server (Server Protocol below)
   - Swaps the persona config
   - Opens localhost:8080 via Playwright MCP
   - Tests every flow listed for that persona
   - Takes screenshots of every meaningful state
   - Writes findings incrementally to the report file
   - Returns a summary of findings

2. **Dispatch a VERIFY subagent** (separate Agent tool) that:
   - Reads the persona report the work subagent wrote
   - Opens the app in browser (Playwright MCP) independently
   - Spot-checks 10 random findings: does the reported behavior actually match what the app shows?
   - Checks for findings the work subagent MISSED (things not in the report)
   - Returns: confirmed count, disputed count, missed findings
   - The verify subagent CANNOT read source code — only browser interaction

3. **You (coordinator):**
   - Read both outputs
   - Update state.json
   - Mark task [DONE] in this plan
   - Move to next persona

This separation catches the self-grading bias that plagued every previous run.

## Rules

### Execution
- ONE persona per cycle (work subagent + verify subagent = one cycle)
- Must be on branch `shiploop/run3-build`. NEVER push.
- Update state.json after every task. Mark [DONE] in this plan.
- At the START of every cycle: re-read state.json and this plan.

### Anti-Patterns
- **DO NOT** do the testing yourself. ALWAYS dispatch subagents.
- **DO NOT** declare victory early. ALL tasks must be [DONE].
- **DO NOT** skip the verify subagent. Separated evaluation is mandatory.
- **DO NOT** mark a persona done if the verify subagent found missed issues.

### Server Protocol
Every time you need the server:
1. `lsof -ti:8080 | xargs kill -9 2>/dev/null || true`
2. `npm run dev &`
3. `for i in {1..30}; do curl -s http://localhost:8080/api/health > /dev/null 2>&1 && break; sleep 1; done`

### Persona Config Swapping
1. Before persona 1: `cp .agent-studio.json .shiploop/config-backup.json`
2. Before each persona: `cp .shiploop/persona-configs/persona-N.json .agent-studio.json`
3. Restart server after swap
4. After EACH persona: `cp .shiploop/config-backup.json .agent-studio.json` (restore immediately)

### State Tracking
```json
{
  "plan_file": "plan-persona-qa-v2.md",
  "current_task": <number>,
  "tasks_done": [],
  "personas_completed": [],
  "findings_total": 0,
  "screenshots_total": 0,
  "last_updated": "<ISO>"
}
```

### Screenshot Storage
`.shiploop/screenshots/qa-v2/persona-N/NNN-description.png`

---

## What MUST Be Tested Per Persona

### Every Persona Tests These (Regression Baseline)

These are bugs found in the previous run. EVERY persona must check ALL of them:

| # | Bug | How to test | Expected |
|---|-----|-------------|----------|
| R1 | History 404 storm | Click History tab → check console for 404s on `/api/sessions/*/usage` | Zero 404s |
| R2 | Setup wizard error handling | Trigger wizard → click "Set me up" → should show error + skip button, NOT silent failure | Error message visible |
| R3 | Sprint Escape key | Open Create Sprint → press Escape | Dialog closes |
| R4 | Settings defaults | Open Settings > General → check default model matches .agent-studio.json | Matches config |
| R5 | Dead terminal cleanup | Kill a session → main area should clear | No garbled output |
| R6 | Command palette items | Cmd+Shift+K → count items | 9+ items including Sprints, Reports, Settings, Dev Servers |
| R7 | Shortcut text | Sessions empty state → read shortcut text | Says "Cmd+Shift+N" not "Cmd+N" |
| R8 | Room agents dynamic | Open Create Room → verify agents from /api/agents, no orchestrator lock | Dynamic list, all toggleable |
| R9 | Notification badge | Check page title for "(N)" → navigate to clear it | Badge clears |
| R10 | ARIA warnings | Open any page → check console for accessibility warnings | <5 warnings |
| R11 | Garbled terminal on kill | Kill a running session → check for raw escape codes | Clean output, no garble |
| R12 | Git in sidebar | Check sidebar for git repos section (if projects configured) | Repos visible with branch name |
| R13 | Session name truncation | Check sidebar session names → hover for full name tooltip | Readable names, title attribute on hover |
| R14 | Setup wizard "Looks good" disabled | Trigger wizard, fail analysis → verify button disabled | Button greyed out when no agents |
| R15 | Sprint working dir pre-fill | Open Create Sprint → check working directory field | Pre-filled from config defaults |
| R16 | Default CWD in session dialog | Open New Session → check working directory field | Pre-filled from config, not "~" |
| R17 | Nav tooltips not overlapping | Hover nav rail icons → check tooltip position | Tooltips don't cover sidebar content |
| R18 | Session name truncation hover | Hover truncated name in sidebar | Full name visible in tooltip |
| R19 | Viewport at 800px | Resize to 800px width | App usable, no overlapping elements |
| R20 | PROD badge color | Check PROD badge in sidebar (if prod project exists) | Noted — red is acceptable for danger |

### Every Persona Tests These (New Workflow Engine)

| # | Feature | How to test | Expected |
|---|---------|-------------|----------|
| W1 | Workflow API exists | `fetch('/api/workflows')` in console | 200 with array |
| W2 | Create workflow via API | POST to `/api/workflows` with a 2-step definition | 201 + definition returned |
| W3 | Start run via API | POST to `/api/workflows/{id}/run` | 201 + runId |
| W4 | Run state on disk | Check `.agent-studio/workflows/*/runs/*/state.json` | File exists with correct structure |
| W5 | WebSocket events | Listen for `workflow-step-update` after starting run | Events fire |
| W6 | Gate approval | Create workflow with gate → start run → approve via API | Run resumes after approval |
| W7 | Workflow list API | GET `/api/workflows` after creating several | All listed with correct status |
| W8 | Gate rejection with feedback | Create workflow with gate → reject with feedback text | Previous step re-runs with feedback |
| W9 | Loop execution | Create workflow with loop (max 3) → verify iteration count | Correct iterations in run state |
| W10 | Timeout handling | Create workflow with 1s timeout → verify step times out | Step status = "timeout" |
| W11 | Cancel mid-run | Start a run → cancel via API mid-execution | Status = "cancelled", process killed |
| W12 | Schedule creation | POST schedule (5s test interval) → verify fires | Run starts automatically |
| W13 | Schedule skip-if-running | Schedule fires while run active → verify skip | No duplicate run created |
| W14 | Server restart recovery | Start run → kill server → restart → check run state | Run paused, resumable |
| W15 | Nested agent group | Create workflow with agent-group step → verify sub-steps | Sub-steps execute in order |
| W16 | Delete workflow with no runs | DELETE workflow → verify removed from disk | 200, files gone |
| W17 | Delete workflow with active run | DELETE while running → verify blocked | 409, "cancel active runs first" |
| W18 | Workflow validation | POST invalid workflow (no steps) → verify rejection | 400 with error message |

---

## Tasks

### 1. [ ] Persona 1: Curious Newcomer

**Config:** `.shiploop/persona-configs/persona-1.json` (setupComplete: false)

**WORK SUBAGENT instructions — dispatch with Agent tool:**

> You are testing Agent Studio as a NEWCOMER — someone who just downloaded the app and has never used it. Config has no setup complete, no projects, no agents.
>
> Start server, swap config, navigate to localhost:8080 via Playwright MCP.
>
> TEST THESE FLOWS (take screenshots of everything):
>
> **Setup & First Run:**
> 1. Cold open — what appears? Setup wizard?
> 2. Setup wizard step 1 — fill in project description, click "Set me up"
> 3. If error: verify error message shows + "Skip" button exists (R2)
> 4. Click skip or back button — verify back works (preserves text)
> 5. Complete setup — verify main dashboard appears
>
> **Navigation & Empty States:**
> 6. Click EVERY tab: Sessions, Teams, Sprints, Memory, Reports, Dev Servers, Settings
> 7. Screenshot each tab's empty state — verify helpful guidance text
> 8. Check nav rail tooltips — hover each icon, verify description appears (not overlapping sidebar)
>
> **Regression Checks (R1-R10):**
> 9. R1: Click History → check console for 404s
> 10. R3: Open Create Sprint → press Escape → verify closes
> 11. R4: Settings > General → verify default model
> 12. R6: Cmd+Shift+K → count command palette items
> 13. R7: Sessions empty state → read shortcut text
> 14. R8: Create Room dialog → verify dynamic agents, no orchestrator lock
> 15. R10: Check console for ARIA warnings
>
> **New Workflow Engine:**
> 16. W1: Run `fetch('/api/workflows')` in console → screenshot response
> 17. W2: POST a simple workflow via console → screenshot response
> 18. W3: Start a run via API → screenshot response
> 19. W4: Check if run state file exists (via API or console)
>
> **Edge Cases:**
> 20. Resize window to 800x400 — screenshot
> 21. Resize to 1920x1080 — screenshot
> 22. Rapid-click all tabs (20 clicks in 5 seconds) — verify no crash
> 23. Open Create Agent dialog — verify 3-step wizard works
> 24. Open Add Server dialog — verify form works
> 25. Try keyboard shortcuts: Cmd+Shift+N, Cmd+Shift+K, Cmd+\, Escape
>
> **Depth (keep going until 750+ interactions):**
> 26. Try every modal: session launcher, create room, create sprint, create agent, add server, command palette
> 27. Try empty form submissions on every dialog
> 28. Try very long text (500+ chars) in every text input
> 29. Try special characters (emoji, quotes, slashes) in names
> 30. Check every settings tab: General, Projects, Agents, System Monitor, Automations, Shortcuts, About
>
> Write ALL findings to `.shiploop/reports/persona-1-newcomer-v2.md`
> Save screenshots to `.shiploop/screenshots/qa-v2/persona-1/`
> Return: summary of findings with counts (critical/high/medium/low)

**VERIFY SUBAGENT instructions — dispatch separately:**

> You are an INDEPENDENT VERIFIER. Read `.shiploop/reports/persona-1-newcomer-v2.md` (the report from the testing subagent). Then open localhost:8080 via Playwright MCP and spot-check:
> 1. Pick 10 findings from the report. For each: navigate to the relevant screen and verify the finding is accurate.
> 2. Check for 5 things NOT in the report — screens or features the tester might have missed.
> 3. You CANNOT read source code. Only interact via browser.
> Return: { confirmed: N, disputed: N, missed_findings: [...] }

### 2. [ ] Persona 2: Project Developer

**Config:** `.shiploop/persona-configs/persona-2.json` (one project, no agents)

**WORK SUBAGENT — same structure as Persona 1 but different focus:**

> You are a DEVELOPER who has one project and Claude Code installed but no agents. Testing Agent Studio for the first time as a replacement for terminal tabs.
>
> TEST THESE FLOWS:
>
> **Sessions (core feature for this persona):**
> 1. Open session launcher (Cmd+Shift+N) — verify all fields
> 2. Launch a session — verify terminal appears, can type
> 3. Launch 2nd session — verify side-by-side grid
> 4. Launch 3rd, 4th, 5th, 6th — verify grid layouts adapt (L-shape, 2x2, 2x3)
> 5. Launch 7th — verify it goes to background with sidebar indicator
> 6. Focus sessions by Cmd+1 through Cmd+6 — verify focus switching
> 7. Fullscreen a session (Cmd+Enter) — verify, then Escape to exit
> 8. Kill a session — verify grid reflows + no garbled output (R5)
> 9. Resume a killed session — verify it works
> 10. Zoom controls (+/-) on terminal panes — verify
> 11. Check session cost and context tracking — verify badges update
>
> **Agent & Sprint Creation:**
> 12. Open scaffold dialog — verify agent creation works
> 13. Create an agent — verify it appears in launcher
> 14. Create a sprint with the new agent — verify pipeline preview
> 15. Sprint gate toggles — verify they appear and toggle
>
> **Git Integration:**
> 16. Check git section in sidebar — verify repos show (if project configured)
> 17. Git branch panel — verify branch list renders
> 18. Create a new branch — verify it appears
> 19. Switch branches — verify dirty state warning
>
> **Dev Servers:**
> 20. Check Dev Servers view — verify auto-detection
> 21. Open Add Server dialog — verify form fields
> 22. Save a custom server — verify it appears in list
>
> **Workflow Engine (API-level):**
> 23-30. Same W1-W7 tests as Persona 1, plus:
> - Create a workflow with 3 steps → start run → verify all 3 steps complete
> - Create a workflow with a gate → verify it pauses → approve → verify it continues
>
> **Regression R1-R10:** Test all 10 regression items.
>
> **Depth:** Keep testing until 800+ interactions. Try weird things. Break the UI.
>
> Write to `.shiploop/reports/persona-2-developer-v2.md`
> Screenshots to `.shiploop/screenshots/qa-v2/persona-2/`

**VERIFY SUBAGENT:** Same pattern — spot-check 10 findings + find 5 missing things.

### 3. [ ] Persona 3: Agent Builder

**Config:** `.shiploop/persona-configs/persona-3.json` (project + agent system)

**WORK SUBAGENT focus:**

> You are an AGENT BUILDER with 3-5 agents configured. You want the visual cockpit experience.
>
> **Agent-Specific Testing:**
> 1. Verify agents auto-detected from ~/.claude/agents/
> 2. Launch session with specific agent selected — verify agent badge
> 3. Launch 4 sessions with different agents — verify grid shows all with agent labels
> 4. Create a NEW agent via the wizard — verify 3-step flow (describe/configure/preview)
> 5. After creating: verify agent appears immediately in launcher and sprint picker
>
> **Sprint Deep Dive:**
> 6. Create sprint — pick 3+ agents, configure pipeline
> 7. Verify gate toggles work per step (approval required on/off)
> 8. Verify QA loop checkbox on QA steps
> 9. Verify scheduling options (manual, recurring with interval picker)
> 10. Preview pipeline — verify step order matches selections
> 11. Sprint controls: pause, resume, cancel — verify each
> 12. Sprint step cards: "Go" and "Approve" buttons — DO THEY ACTUALLY WORK?
> 13. Activity log — verify timestamps and events
>
> **Room Chat (deep test):**
> 14. Create room — verify agents loaded dynamically (no hardcoded list)
> 15. Verify NO orchestrator lock — all agents freely toggleable
> 16. Start room, send message — verify it delivers
> 17. Check agent status indicators (offline/idle/working)
> 18. Click agent name in chat — verify navigation to their session
>
> **Workflow Engine:**
> 19-25. All W1-W7 tests plus:
> - Create workflow using discovered agents → start → verify agent names in run state
> - Create workflow with loop (3 iterations max) → verify iteration tracking
> - Create workflow with agent-group → verify nested steps execute
>
> **Memory & Reports:**
> 26. Memory: create entry, edit it, search for it, filter by category, delete it
> 27. Reports: check list, open detail, refresh
>
> **Regression R1-R10 + depth to 850+ interactions.**
>
> Write to `.shiploop/reports/persona-3-builder-v2.md`
> Screenshots to `.shiploop/screenshots/qa-v2/persona-3/`

**VERIFY SUBAGENT:** Same pattern.

### 4. [ ] Persona 4: Returning Power User

**Config:** `.shiploop/persona-configs/persona-4.json` (full setup, history, preferences)

**WORK SUBAGENT focus:**

> You are a POWER USER who uses Agent Studio daily. Full config, history, agents, everything.
>
> **Speed & Persistence:**
> 1. App opens — verify no setup wizard, settings preserved
> 2. Default model and permissions remembered — verify
> 3. Recent sessions in sidebar — verify history
> 4. Resume a previous session — verify
> 5. Check "Running on Machine" — verify external Claude processes detected
>
> **Daily Workflow:**
> 6. Launch daily sprint with preferred agents — verify fast setup
> 7. While sprint runs, launch standalone session for side task — verify both work
> 8. Switch between sprint view and session rapidly — verify no UI glitch
> 9. Create PR from git section — full flow through modal
> 10. Git branches: list, create, switch — verify all work
>
> **Workflow Engine (full test):**
> 11. Create complex workflow: 2 agents → gate (with artifact) → loop(2 agents, max 3) → final agent
> 12. Start run via API — monitor step progression
> 13. At gate: check artifact path is included in response
> 14. Approve gate — verify run continues
> 15. Verify loop executes (check iteration count in run state)
> 16. Verify final step completes
> 17. Check full run state on disk — verify all step timestamps
> 18. Create SCHEDULED workflow (5-second test interval)
> 19. Verify schedule persists to disk
> 20. Verify first run fires automatically
> 21. Pause schedule — verify stops
> 22. Resume — verify fires again
> 23. Kill server mid-run — restart — verify run paused (not restarted)
> 24. Resume paused run — verify continues from correct step
>
> **Settings Deep Dive:**
> 25. Settings > Automations — verify scheduled workflows listed (if UI exists)
> 26. Settings > System Monitor — verify CPU/memory/disk data
> 27. Change a setting, reload page — verify persisted
>
> **Edge Cases & Stress:**
> 28. Open command palette in different views — verify context-appropriate
> 29. All keyboard shortcuts while sessions running — verify none conflict
> 30. Kill all sessions at once — verify clean reset
> 31. Very long workflow (10+ steps) via API — verify execution completes
> 32. Workflow with feedback loop: reject gate with feedback → verify re-run with feedback
>
> **Regression R1-R10 + depth to 900+ interactions.**
>
> Write to `.shiploop/reports/persona-4-poweruser-v2.md`
> Screenshots to `.shiploop/screenshots/qa-v2/persona-4/`

**VERIFY SUBAGENT:** Same pattern.

### 5. [ ] Cross-Persona Evaluation

**Dispatch evaluation subagent (Agent tool):**

> Read ALL 4 persona reports:
> - .shiploop/reports/persona-1-newcomer-v2.md
> - .shiploop/reports/persona-2-developer-v2.md
> - .shiploop/reports/persona-3-builder-v2.md
> - .shiploop/reports/persona-4-poweruser-v2.md
>
> Also read the PREVIOUS evaluation for comparison:
> - .shiploop/reports/evaluation.md
>
> Write `.shiploop/reports/evaluation-v2.md` with:
> 1. Deduplicated issue list (by severity: critical/high/medium/low)
> 2. Cross-persona patterns (issues confirmed by multiple personas)
> 3. Regression status: which of the 20 previous issues are fixed vs still broken?
> 4. NEW issues from the workflow engine
> 5. Honest health score using formula: ((total - critical*4 - high*2 - medium*1) / total) * 100
> 6. What's working well (acknowledge good stuff)
> 7. Top 10 issues that would make a user give up
> 8. Comparison: health score v1 vs v2 (did things improve?)
> 9. Workflow engine readiness: API working? Frontend ready? Shipping blockers?

### 6. [ ] Fix Critical + High Issues

**For each critical/high issue from the evaluation:**
- Dispatch a work subagent to fix it (one fix per commit)
- Dispatch a verify subagent to test the fix via browser
- If verify passes: commit. If not: re-fix.
- NEVER push.

### 7. [ ] Fix Medium Issues

Same pattern as task 6, for medium severity issues.

### 8. [ ] Final Verification

**Dispatch a smoke test subagent:**
> Navigate the ENTIRE app via Playwright MCP. Every tab, every dialog, every feature.
> - Zero console errors on clean load
> - All workflow API endpoints responding
> - All previous bug fixes still working
> - Take screenshots of every key screen → `.shiploop/screenshots/qa-v2/final/`
> Write `.shiploop/reports/final-smoke-v2.md`

### 9. [ ] Final Report + Health Curve

**BUILD:**
- Write `.shiploop/reports/final-report-qa-v2.md`:
  - Health score before/after
  - Issues found per persona
  - Issues fixed
  - Workflow engine QA status
  - Screenshots inventory
  - Comparison with previous QA run
- Generate `.shiploop/health-curve-qa-v2.html`:
  - Dark bg (#0a0a0a), amber curve (#f59e0b), monospace
  - Show health progression: previous run score → this run score per persona
  - Title: "Agent Studio QA — Persona Testing v2"
  - Pure HTML/CSS/SVG, no deps, under 150 lines

# ShipLoop Plan — Run 3

## Build Phase (from context-build.md)

1. [DONE] **Add Dev Server button** — Dialog with name/port/command/cwd/auto-start, POST /api/dev-servers/custom endpoint.

2. [DONE] **In-app guidance & empty states** — Enhanced empty states in Sprints, Reports, Memory. Added sidebar subtitles, nav tooltips with descriptions.

3. [DONE] **Context indicator thresholds** — Already fixed. Green <30%, yellow <60%, red ≥60%.

4. [DONE] **Monitor labels clarity** — Already fixed. Settings tab renamed to "System Monitor" with subtitle.

5. [DONE] **Nav rail tooltip descriptions** — Already fixed. Each nav item has a hint subtitle.

6. [DONE] **Agent Creation Flow** — 3-step dialog (Describe/Configure/Preview), POST /api/agents/create endpoint, wired into Settings > Agents tab.
   - 6a. [DONE] Create agent-creator component with free-text input
   - 6b. [DONE] Add server route POST /api/agents/create
   - 6c. [DONE] Add agent preview/edit step before saving
   - 6d. [DONE] Wired into Settings > Agents tab with "Create Agent" button
   - 6e. [ ] After 3+ agents, suggest sprint configurations (deferred)

7. [DONE] **Sprint Creation UI** — 3-step dialog with goal/agents/pipeline preview, POST /api/sprints/create, "New Sprint" button in sidebar.
   - 7a. [DONE] Create sprint dialog with goal, agent picker, pipeline order
   - 7b. [DONE] Gates auto-generated from selected agents
   - 7c. [ ] Scheduling configuration (deferred — on-demand works)
   - 7d. [DONE] Preview pipeline with reorder before starting
   - 7e. [DONE] Wired into sprints sidebar and page

8. [DONE] **Git branch management** — Collapsible branches panel, new branch form, switching with dirty warning, 3 API endpoints.
   - 8a. [DONE] Branch list panel with ahead/behind badges
   - 8b. [DONE] Inline branch creation form
   - 8c. [DONE] Branch switching with dirty state warning
   - 8d. [DONE] PR creation already accessible via git sidebar

9. [DONE] **Fix zombie PTY on room close** — Room close now awaits SDK session destruction with SIGTERM→SIGKILL escalation.

10. [SKIP] **Fix terminal broadcast storm** — Would require modifying the WebSocket message protocol (blocked by CLAUDE.md constraint). The 50ms batching in terminal-manager.ts mitigates the issue. Each client already filters by sessionId on the frontend.

11. [DONE] **Fix aggressive polling** — Reduced 13 intervals across 10 files. 5s→15s, 10s→30s, 30s→60s for idle states.

12. [DONE] **Add client-side room message cap** — Added `.slice(-200)` rolling window to Zustand addMessage action.

13. [DONE] **Fix Agent Tasks loading states** — Added loading spinner, error display, and empty state to workflow builder dialog.

14. [DONE] **Fix Sprint resume UX** — Resume button now prominent with solid amber fill, PlayIcon, and confirmation step.

## Build Phase Status: COMPLETE
All critical features built. Deferred: 6e (sprint suggestions), 7c (recurring scheduling). Skipped: 10 (broadcast storm — WebSocket protocol constraint).

---

## Test Phase (from context.md) — START HERE

15. [ ] **Persona 1: Newcomer** — Swap to persona-1 config (no setupComplete). Test setup wizard every step, empty states, first-time UX, navigation, every tab when empty, keyboard shortcuts, help panel. Test the NEW features too: agent creation dialog, sprint creation dialog, add server dialog. Write report to .shiploop/reports/persona-1-newcomer.md with screenshots.

16. [ ] **Persona 2: Developer** — Swap to persona-2 config (one project, no agents). Test session creation, terminal grid layouts (1-6 sessions), session lifecycle (create/focus/kill/resume), scaffold wizard, git integration with NEW branch management, dev servers with NEW add server button. Write report to .shiploop/reports/persona-2-developer.md.

17. [ ] **Persona 3: Agent Builder** — Swap to persona-3 config (project + agent system). Test agent detection, NEW agent creation flow, NEW sprint creation with pipeline preview, rooms/chat, sprint timeline with NEW resume/pause UX, sprint step actions (Go/Approve), 6 concurrent sessions, cost tracking, memory CRUD, reports. Write report to .shiploop/reports/persona-3-builder.md.

18. [ ] **Persona 4: Power User** — Swap to persona-4 config (full setup). Test settings persistence, session resume, NEW git branch management (list/create/switch), PR creation, dev servers with port detection, command palette, all keyboard shortcuts while sessions running, monitor tab, notifications. Write report to .shiploop/reports/persona-4-poweruser.md.

19. [ ] **Cross-persona evaluation** — Read all 4 persona reports. Identify patterns, top 20 issues, honest health score. Write .shiploop/reports/evaluation.md.

20. [ ] **Fix critical/high/medium issues** — Fix everything the evaluation identifies as critical, high, or medium severity. One fix per commit. Re-verify each fix via browser. Only skip LOW (nitpicks).

21. [ ] **[CRITICAL] Fix Room orchestrator dependency** — Room creation (create-room-dialog.tsx) has hardcoded DEFAULT_AGENTS with orchestrator locked:true. Server (rooms.ts:162-167) force-injects orchestrator even if not selected. Room chat routes messages to "orchestrator" by default. FIX: Read actual agents from /api/agents (like sprint dialog does). Remove forced orchestrator lock. Let user pick any agents. If user has no agents, rooms should work with plain Claude sessions. Make "lead agent" configurable, not hardcoded. This blocks ALL users who don't have an orchestrator agent.

22. [ ] **[CRITICAL] Enhance Sprint creation with gate config** — Sprint dialog is missing: (a) per-step approval gate toggle (headless vs needs-approval), (b) scheduling config (on-demand vs recurring interval), (c) notification channel config (Telegram, Mac notifications), (d) QA loop behavior (linear vs loop-until-passing). The pipeline builder also hardcodes agent name matching for ordering — should handle arbitrary agent names intelligently. Add these as additional steps or expandable sections in the existing 3-step dialog. Without this, sprints are just labeled sessions, not real automated pipelines.

23. [ ] **Fix /api/analyze-project error handling** — Endpoint returns 400 and setup wizard silently fails. Even if the LLM call can't work without an API key, add proper error handling: show a clear error message ("Agent generation requires an API key — you can create agents manually later"), offer a fallback path, don't let the wizard proceed as if it succeeded.

24. [ ] **Wire git integration into sidebar** — Git backend works (API routes, store, PR modal all exist), but the sidebar never renders the repos section. Wire the existing git-repos-section component into the sidebar so users can see branches, status, and access PR creation. This was already built in Phase 1 but isn't accessible.

25. [ ] **Add back button to setup wizard step 2** — No way to go back from step 2 to step 1 to change project description. Add a Back button. 5 minute fix.

26. [ ] **Fix nav rail tooltip positioning** — Tooltips overlap sidebar content. Adjust tooltip offset or add a delay so they don't cover content the user is trying to read.

27. [ ] **Pre-fill default working directory in session dialog** — New Session dialog shows "~" instead of the configured default working directory from .agent-studio.json. Read the default and pre-fill.

28. [ ] **Fix session name truncation in sidebar** — Names like "InPipel...", "AgentSt..." are barely readable when sidebar has space. Use a wider truncation threshold or show full name on hover.

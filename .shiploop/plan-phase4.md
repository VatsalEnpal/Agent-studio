# ShipLoop Phase 4 — Final Polish + Demo Video + README

> Complete ALL tasks in order. Do NOT stop early. Do NOT declare victory until task 12 is done.

## Part A: Fix Remaining 3 Issues (health 88 → 100)

1. [DONE] **Fix /api/analyze-project to use Claude Code CLI** — The user already has Claude Code installed and authenticated. Instead of making a direct Anthropic API call (which needs ANTHROPIC_API_KEY), spawn a Claude Code process to analyze the project:
   - **First: detect Claude Code** — Check if `claude` is on PATH (`which claude` or `command -v claude`). Store the result. This check should happen at server startup and be cached.
   - **If Claude Code exists:** When user clicks "Set me up", run: `claude -p "Analyze the project at {path}. List what the project does, its tech stack, and suggest 3-5 specialized agent definitions. Return JSON: {agents: [{id, name, description, tools, rules}]}" --output-format json`
   - **Parse the response** and generate agent .md files from it
   - **If Claude Code is NOT installed:** Show a clear message in the wizard: "Claude Code CLI not found. Install Claude Code first (https://claude.ai/code) or create agents manually from Settings > Agents." with a "Skip — create agents manually" button.
   - **If Claude Code exists but the command fails** (timeout, auth error, rate limit): Show the error message and the skip button. Don't silently fail.
   - **Timeout:** Set a 30-second timeout on the claude -p call. Project analysis shouldn't take longer than that.
   - **Security:** The claude CLI uses the user's own auth token. No API keys are stored or transmitted by Agent Studio. This is the safest approach.
   - Test: Run the wizard with Claude Code installed, confirm it generates real agent suggestions. Also test with claude not on PATH, confirm the error message appears.

2. [DONE] **Fix dead terminal auto-cleanup after kill** — When a session is killed, the main panel still shows stale terminal output until user clicks elsewhere. Fix:
   - After session kill, auto-select the next active session (if any) or show the empty state
   - Clean up the terminal DOM element so no garbled escape codes remain
   - Test: Kill a session, confirm main area immediately shows next session or empty state. Screenshot.

3. [DONE] **Add hint to empty git repos section** — When no projects are configured, the git repos section hides. Instead, show a small hint: "Add a project in Settings to see git repos here." with a link/button to Settings > Projects.
   - Test: With no projects configured, confirm the hint appears. Screenshot.

## Part B: Build Demo Mode

4. [DONE] **Add DEMO_MODE flag and terminal sanitizer** — Add a `DEMO_MODE` environment variable check. When true, pipe all terminal output through a sanitizer before rendering:
   - Replace `/Users/{username}` → `/Users/demo`
   - Replace real repo names → generic names
   - Replace API keys (`sk-ant-*`, `ANTHROPIC_API_KEY=*`) → masked versions
   - Replace `enpal` references → `acme-energy` or similar
   - Apply at the terminal render layer (xterm.js write handler) so recordings capture clean output
   - Also sanitize sidebar labels, session names, git branch names
   - Test: Start server with `DEMO_MODE=true npm run dev`, confirm terminal output is sanitized. Screenshot.

5. [DONE] **Create Playwright demo recording script** — Create `scripts/record-demo.mjs` that:
   - Launches Agent Studio in Electron with `DEMO_MODE=true`
   - Records video via Playwright's `recordVideo` option (1280x720)
   - Drives through the 7-shot sequence:
     1. (3s) App opens — dark cockpit, empty state
     2. (3s) Click "Start Sprint" — terminal streams
     3. (4s) Teams tab — sprint workflow steps
     4. (3s) Room — agents chatting
     5. (2s) Memory tab — knowledge entries
     6. (3s) Terminal grid — multiple sessions
     7. End card added in post-production
   - Saves raw recording to `demo-videos/raw.webm`
   - Test: Run the script, confirm it produces a video file. Verify it shows the app clearly.

6. [DONE] **Post-produce the demo video** — Create `scripts/build-demo.sh` that uses ffmpeg:
   - Convert .webm → .mp4
   - Trim to ~18 seconds
   - Add fade-in (0.5s)
   - Create end card (3s, #0a0a0a bg, amber "Agent Studio" text, subtitle)
   - Concatenate with crossfade transition
   - Export Twitter/GitHub optimized (1280x720, H.264, CRF 23, 30fps)
   - Output: `demo-videos/final_demo.mp4`
   - Test: Verify the video plays, looks polished, is under 20 seconds, file size reasonable.

## Part C: Rewrite README

7. [DONE] **Rewrite README.md** — Complete rewrite reflecting ALL changes from ShipLoop Run 3. The README is the first thing someone sees on GitHub. Structure:
   - **Hero section**: App name, one-line description, demo video embed (placeholder until video approved)
   - **What it is**: 2-3 sentences — terminal-first cockpit for AI agent teams
   - **Features list**: ALL features including new ones (agent creation, sprint pipeline with gates, git branch management, add server, memory CRUD, reports, etc.)
   - **Screenshots**: Reference key screenshots from .shiploop/screenshots/ (or take new ones)
   - **Quick Start**: `git clone → npm install → npm run dev → open localhost:8080`
   - **Electron app**: `npm run build:mac` / `npm run install:mac`
   - **How it works**: Brief architecture (Next.js + Express + Electron + xterm.js + WebSocket)
   - **Keyboard shortcuts**: Table of all shortcuts
   - **Configuration**: .agent-studio.json, .claude/agents/, environment variables
   - **Design**: Reference IDENTITY.md (dark theme, Geist Mono, amber accent)
   - **Contributing**: Basic setup instructions
   - **License**: Keep existing
   - Match the app's voice: short, direct, terminal-native. Not chatty. Not corporate.

8. [DONE] **Update ARCHITECTURE.md** — Reflect new components added in Run 3:
   - Agent creation dialog and server route
   - Sprint creation dialog with gate config
   - Git branch management panel
   - Add server dialog
   - Room dynamic agent loading
   - Setup wizard error handling and back button

## Part D: Verify Everything

9. [DONE] **Full app smoke test** — Navigate every tab, open every dialog, test every new feature via Playwright MCP. Zero console errors on fresh load. Screenshot key screens for README.

10. [DONE] **TypeScript clean** — Run `npx tsc --noEmit`. Must be zero errors.

11. [DONE] **Build clean** — Run `npm run build`. Must succeed with zero errors.

12. [DONE] **Write final report** — `.shiploop/reports/final-report-phase4.md` with: health score (target 100), what was built, what was fixed, demo video status, README changes, commit list.

## Rules

- ONE task per cycle. Do not batch.
- Commit each change individually. NEVER push.
- Must be on branch `shiploop/run3-build`.
- Do NOT stop until task 12 is marked [DONE].
- If stuck on a task for 2 cycles, mark [BLOCKED] and move to next.
- For the demo video: if ffmpeg is not installed, mark tasks 5-6 as [BLOCKED] and note that `brew install ffmpeg` is needed. Continue with other tasks.

# ShipLoop Phase 5 — Demo Video That Actually Impresses

> The goal is a 15-20 second video that makes someone stop scrolling and think "I need this." Not a feature walkthrough. Not a tutorial. A MOMENT that shows the power.
> Complete ALL tasks in order. Do NOT stop until task 10 is done.

## The Problem With the Current Recording

The current video is 144KB of mostly empty screens. Nobody wants to watch someone click through empty tabs. A great demo video shows the product DOING THE THING — agents working in parallel, terminals streaming, sprints progressing, rooms buzzing. Not "here's the settings page."

## What Makes a Great Product Demo Video (research this yourself)

Before building ANYTHING, spend time thinking about what makes product demo videos compelling. Look at how the best tools present themselves — things like Linear, Raycast, Warp, Arc Browser, Cursor. Study their approach:

- They show the product IN ACTION, not a feature tour
- They show SPEED — things happening fast, in parallel, no waiting
- They show DENSITY — lots of information on screen, Bloomberg-terminal vibes
- They cut fast — no shot lingers more than 3-4 seconds
- The first frame hooks you — something visually striking, not a blank page
- Music and pacing matter — ambient electronic, builds tension
- They don't explain — they SHOW

Research the best approaches, then decide how Agent Studio should present itself. Don't follow the shot list from the plan blindly if you find a better approach.

## Part A: Build the Demo Seed (fake data that looks real)

1. [ ] **Create demo seed script** — `scripts/seed-demo.mjs` that populates the app with realistic fake data. Everything should look real but contain NO personal information:
    - **Projects:** 3 fake projects — "velocity-api" (Go backend), "nova-dashboard" (React frontend), "mercury-pipeline" (Python data pipeline). Each with fake git repos, realistic paths under `/Users/demo/Code/`
    - **Agents:** 5 agents in a temp `.claude/agents/` — orchestrator, frontend, backend, qa, devops. Each with realistic .md content
    - **Sessions:** Start 4-6 real Claude Code sessions that produce visible terminal output. Use `claude -p` with prompts that generate interesting-looking output (code diffs, test results, build logs). These should be RUNNING when the video records.
    - **Sprint:** Create a sprint with steps in mixed states — some completed (green), some active (amber, with terminal streaming), some pending (grey). The timeline should look alive.
    - **Room:** Create a room with pre-seeded messages that look like real agent collaboration — orchestrator assigning work, backend reporting completion, QA finding a bug, frontend asking a question. 10-15 messages.
    - **Memory:** Seed 8-10 memory entries across categories (learnings, corrections, decisions) with realistic content about the fake projects
    - **Git:** Fake git status showing branches, changed files, ahead/behind counts
    - **Dev Servers:** Start a couple of lightweight HTTP servers on different ports so Dev Servers section shows activity
    - The seed script should set `DEMO_MODE=true` and use the sanitizer for any real system data that leaks through
    - Test: Run the seed, start the app, confirm every section has rich content. Screenshot each section.

2. [ ] **Create demo teardown script** — `scripts/teardown-demo.mjs` that cleanly removes all fake data and restores the real config. Must be idempotent (safe to run multiple times). Back up real config before seeding, restore after teardown.

## Part B: Record the Video (think before recording)

3. [ ] **Research and decide on the best recording approach** — Before writing the recording script, think about:
    - What's the HOOK? What makes someone stop scrolling? (Probably: 4-6 terminals streaming simultaneously with agent names visible)
    - What's the STORY? In 15 seconds, what journey? (Suggestion: empty → one click → explosion of agent activity)
    - Should it be one continuous take or fast cuts between shots?
    - What resolution? 1280x720 is safe but 1920x1080 shows more density
    - Should there be text overlays or let the product speak?
    - What music? (must be royalty-free, ambient electronic, builds energy)
    - Take screenshots of every key frame for README and GitHub

4. [ ] **Write the recording script** — `scripts/record-demo.mjs` rewritten based on your research:
    - Run the seed script first
    - Wait for all sessions/sprints/rooms to be active and showing output
    - Record at the moment of maximum visual density
    - Capture the shots you decided on in task 3
    - Record at 1920x1080 if it looks better, downscale in post
    - The recording should run HEADLESS (Playwright headless mode) — add `headless: true` to the launch options
    - Take high-res screenshots at each key moment for README/GitHub/sharing
    - Save screenshots to `demo-videos/screenshots/` with descriptive names
    - Save raw video to `demo-videos/raw.webm`

5. [ ] **Post-produce** — Update `scripts/build-demo.sh`:
    - Convert raw recording to mp4
    - Trim to the best 15-18 seconds (cut dead air, cut transitions that drag)
    - Add end card (3s, #0a0a0a bg, amber "Agent Studio" + tagline)
    - Add crossfade between main content and end card
    - If you found good royalty-free music: download it, add at 15% volume with fade in/out
    - Export two versions:
      - `final_demo.mp4` — Twitter/GitHub optimized (1280x720, H.264, <8MB)
      - `final_demo_hd.mp4` — Full quality (1920x1080) for website/presentations
    - Also export a GIF version for GitHub README fallback: `final_demo.gif` (under 10MB, 15fps, 720p)

6. [ ] **Self-review the video** — Watch the output critically:
    - First frame: would you stop scrolling?
    - Does it show the product DOING something, not just existing?
    - Is there dead air / boring moments? Cut them.
    - Does the end card feel polished or cheap?
    - Is the pacing right? Too slow = boring. Too fast = confusing.
    - Does it look like a real product or a hackathon demo?
    - If it's not good enough, re-record with different timing/shots. Iterate until proud.
    - Write a brief review to `.shiploop/reports/video-review.md`

## Part C: Screenshots for README and Sharing

7. [ ] **Capture hero screenshots** — Using Playwright, capture high-quality screenshots at key moments for README and social sharing:
    - `hero-terminal-grid.png` — 4-6 sessions running in the grid, terminals streaming
    - `hero-sprint-timeline.png` — Sprint with mixed-state steps, timeline view
    - `hero-room-chat.png` — Room with agent messages and status indicators
    - `hero-agent-creation.png` — The 3-step agent creation wizard
    - `hero-sprint-creation.png` — Sprint creation with gate toggles and pipeline preview
    - `hero-memory.png` — Memory tab with entries across categories
    - `hero-settings.png` — Settings page showing the cockpit feel
    - All at 2x resolution for retina, save to `demo-videos/screenshots/`
    - These should look BEAUTIFUL — full data, good state, showing the app at its best

8. [ ] **Update README with screenshots** — Replace placeholder text with actual screenshot embeds. Add the demo video embed (or link to where it will be hosted). The README should look like a polished product page, not a dev doc.

## Part D: Cleanup and Verify

9. [ ] **Run teardown** — Remove all demo data, restore real config. Verify the app still works normally with real data.

10. [ ] **Write final report** — `.shiploop/reports/final-report-phase5.md`:
    - Video quality assessment (honest)
    - Screenshot inventory with paths
    - What looks great vs what could be better
    - Suggested improvements for a v2 recording
    - File sizes and formats produced

## Rules

- ONE task per cycle. Do not batch.
- Commit demo scripts individually. NEVER push.
- Must be on branch `shiploop/run3-build`.
- Do NOT stop until task 10 is marked [DONE].
- Use subagents for heavy work (seeding, recording, screenshotting).
- If the video isn't good enough after first attempt, iterate. Quality > speed.
- DEMO_MODE must be active during all recording/screenshotting.
- The teardown script MUST work — don't leave Vatsal's machine with fake data.

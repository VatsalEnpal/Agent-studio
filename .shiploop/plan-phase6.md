# ShipLoop Phase 6 — Re-record Demo Video (Better)

> The Phase 5 video was bad. Static fake terminal output, too much empty space, no "wow" moment. This phase re-records it properly.
> Complete ALL tasks. Do NOT stop until task 5 is done.

## What Was Wrong With the Phase 5 Video

1. **Terminal content was fake static text** — showed `go build`, `go test` output that nobody cares about. Doesn't look like Claude Code AT ALL. No thinking indicators, no tool use, no code diffs, no the distinctive Claude CLI interface.
2. **Sessions were dead** — 5 sessions listed but all showing static completed output. Nothing moving. The whole point is agents working IN PARALLEL.
3. **Too much empty space** — one session taking full screen with 70% black space below.
4. **No wow moment** — looked like a static mockup, not a live tool.
5. **Room chat text too small** — unreadable at video resolution.

## Your Job: THINK First, Then Build

Do NOT just follow the shot list below. The tasks and shots are SUGGESTIONS — a starting point based on what we think looks good. But you might find something better. Before you build anything, spend real time thinking:

- **What moment would make a developer stop scrolling?** Maybe it's 4 terminals streaming code simultaneously. Maybe it's a sprint timeline lighting up step by step. Maybe it's starting with a single session and then watching the grid fill up one by one. Maybe it's something you discover while exploring the app that we haven't thought of.
- **What's the STORY?** A great demo has a narrative arc, even in 15 seconds. Some ideas:
  - Empty cockpit → user clicks one button → explosion of 6 agents launching simultaneously
  - Already running: 4 agents building in parallel → zoom into one writing code → pull back to see the full team
  - A session starts → types a sprint goal → agents spin up → sprint timeline shows progress → done
  - Something else entirely — think about what would make YOU want to download this app
- **What does the app look like at its BEST?** Run the seed script. Then open the app and just LOOK at it. Navigate every tab. Find which screens are the most visually impressive at this moment. Maybe the sprint timeline with mixed states is more striking than the terminal grid. Maybe the room with colorful agent names is the hero. Let the app tell you — don't assume the grid is the best shot.
- **Study real product videos.** Before recording, search for demo videos from Linear, Raycast, Warp, Arc Browser, Cursor. Watch 5-10 of them. Notice: how do they pace shots? What do they show first? How do they create momentum and urgency? What makes you want to try the product? Steal the best ideas and adapt them.
- **Think about what Claude Code output looks like.** The thinking dots (`⏺ Thinking...`), the colored tool use blocks, the streaming code with syntax highlighting, the `Read`, `Edit`, `Bash` tool calls — that's visually unique. A developer seeing that in a terminal grid will IMMEDIATELY understand what this app does. How do you capture that moment at its peak?
- **Think about pacing.** Fast cuts build energy. But one held shot of 4 terminals all streaming at once can be more powerful than rapid cuts. What serves this product better? Try both. The first shot matters most — it's the hook. The last shot before the end card matters second — it's the lasting impression.
- **Think about what NOT to show.** Settings? Boring. Empty states? Boring. The setup wizard? Only interesting if you show the RESULT (agents appearing). Cut anything that doesn't make someone think "I need this."

The suggestions below are a STARTING POINT. If you find a better approach while thinking, OVERRIDE THEM. The goal is the best possible 15-second video, not following instructions.

## Tasks

1. [ ] **Rewrite seed script for REAL Claude Code sessions** — The seed must start actual `claude -p` sessions that produce real Claude Code CLI output. Use prompts that generate visually interesting output:
    - Session 1: `claude -p "Write a REST API endpoint for user authentication with JWT tokens"` — shows code generation
    - Session 2: `claude -p "Find and fix the bug in this function: [paste a small buggy function]"` — shows debugging with tool calls  
    - Session 3: `claude -p "Write unit tests for the auth module"` — shows test generation
    - Session 4: `claude -p "Review this PR diff for security issues: [paste a diff]"` — shows code review
    - These should be launched via the Agent Studio session launcher (not raw terminal) so they show in the grid with proper labels, model badges, cost tracking
    - Use `--model sonnet` for speed (real-time output matters for the recording)
    - All with DEMO_MODE=true for path sanitization
    - The sessions should still be ACTIVELY STREAMING when the recording starts — don't wait for them to finish
    - Sprint and room seeding can stay similar to Phase 5 but ensure the sprint shows mid-execution state
    - Test: Start seed, wait 5-10 seconds for sessions to start streaming, confirm 4+ terminals have active Claude Code output with thinking dots and tool calls visible.

2. [ ] **Re-record with the grid as hero shot** — Rewrite record-demo.mjs:
    - Start seed, wait for sessions to be actively streaming (not finished)
    - Shot 1 (3s): Terminal grid with 4 sessions streaming simultaneously — THIS IS THE HERO SHOT. Capture at maximum visual density.
    - Shot 2 (2s): Quick cut to sprint timeline — mixed states, "In Progress" on one step
    - Shot 3 (2s): Quick cut to room chat — agents talking, colorful names
    - Shot 4 (2s): Quick cut back to grid — different sessions now showing different output
    - Shot 5 (2s): Memory tab briefly
    - Total: ~12-13 seconds of content + 3s end card = 15-16 seconds
    - Record at 1920x1080 headless
    - Take hero screenshots at each shot transition
    - The KEY difference: sessions must be ACTIVELY STREAMING during recording, not showing static completed output

3. [ ] **Post-produce** — Same ffmpeg pipeline but:
    - Faster cuts between shots (use xfade with 0.3s transitions instead of 0.5s)
    - End card: amber "Agent Studio" on #0a0a0a, subtitle "AI agents, working in parallel"
    - Export 3 formats: mp4 720p (Twitter), mp4 1080p (presentations), GIF (README)

4. [ ] **Self-review by extracting frames and LOOKING at them** — You can't watch a video, but you CAN see individual frames. Extract key frames and review them visually:
    ```bash
    # Extract one frame per second from the video
    $FFMPEG -i demo-videos/final_demo_hd.mp4 -vf "fps=1" demo-videos/frames/frame_%03d.png
    ```
    Then Read each frame image. For each frame, ask:
    - What do I see? Is there actual content or mostly black space?
    - Does this frame show the app DOING something or just existing?
    - Would this frame work as a screenshot on its own?
    - Is text readable at this resolution?
    - Does it look like a real product or a hackathon demo?
    
    Specifically check:
    - Frame 1 (the hook): Does it show maximum density? Multiple terminals streaming? YES/NO
    - Frames 2-4: Is there variety between shots? Different content each time? YES/NO
    - Last frame before end card: Strong lasting impression? YES/NO
    - End card: Clean, readable, professional? YES/NO
    
    If any frame is bad (empty, too much black space, static content, unreadable text): identify WHICH shot needs fixing, adjust the timing or content in the seed/recording script, and re-record. Iterate until every extracted frame looks good.
    
    Write detailed review with frame references to .shiploop/reports/video-review-v2.md

5. [ ] **Update README + teardown** — Replace old video/screenshots with new ones. Run teardown. Restore real config. Verify app works.

## Rules

- Must be on branch `shiploop/run3-build`. NEVER push.
- DEMO_MODE=true for all recording.
- Back up .agent-studio.json BEFORE seeding. Restore AFTER teardown.
- The sessions need REAL Claude Code output — `claude -p` with actual prompts. Not fake echo text.
- If Claude Code sessions take too long to start producing output, increase the wait time before recording. Better to wait 30 seconds for good content than record 5 seconds of blank terminals.
- ONE task per cycle. Do NOT stop until task 5 is [DONE].

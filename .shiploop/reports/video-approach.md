# Demo Video Approach — Agent Studio

## Research Summary

What makes great dev tool demos (Linear, Warp, Cursor style):

- Show the product IN ACTION, not a feature tour
- Speed and density — lots happening simultaneously ("Bloomberg terminal" vibes)
- Short: 15-18s for social/README, never over 30s
- First frame HOOKS — visually striking, not a blank page
- No narration — the UI speaks for itself
- Fast cuts — no shot lingers more than 3-4 seconds
- Show the REAL product UI (only 30% of companies do this — we should)

## Agent Studio's Visual Strengths

1. **5 terminals running simultaneously** with colorful output — THIS is the hook
2. **Sprint timeline** with green/amber/grey gate states — visual progress
3. **Multi-agent room chat** — AI agents talking to each other with @mentions
4. **Memory entries** with categories and tags — knowledge management
5. **Git sidebar** with repos and branch names — real-world context

## Decision: The Approach

### The Story (15-18 seconds)

Start at MAXIMUM DENSITY. Don't show empty state, don't show setup.
Show the product at its most impressive, then cut between views.

### Shot List

| Shot     | Time   | Tab      | What we see                                                                      |
| -------- | ------ | -------- | -------------------------------------------------------------------------------- |
| 1 - HOOK | 0-4s   | Sessions | 5 terminals in grid, colorful streaming output. The "command center" money shot. |
| 2        | 4-8s   | Sprints  | Auth System Overhaul at 50% — 4 green/1 amber/3 grey gates. Orchestration.       |
| 3        | 8-12s  | Rooms    | Agent conversation with @mentions. Multi-agent collaboration.                    |
| 4        | 12-15s | Memory   | 10 entries across categories with tags. Knowledge system.                        |
| 5        | 15-18s | End Card | Crossfade to #0a0a0a bg, amber "Agent Studio" + tagline.                         |

### Technical Decisions

- **Resolution**: Record at 1920x1080 (more density), downscale to 1280x720 in post
- **Recording**: Playwright headless with video recording
- **Navigation**: Keyboard shortcuts (Cmd+1,2,3,4) for instant tab switches
- **No music**: Clean for social embedding, avoids licensing issues
- **No text overlays**: The UI has enough text — let the product speak
- **Dark mode**: Already default, looks great in video
- **One continuous take**: Keyboard navigation is fast enough, no need for cuts-in-post
- **End card**: 3 seconds, fade transition, amber text on dark bg via ffmpeg

### Post-Production Pipeline (ffmpeg-full)

1. Raw recording → trim to 18s
2. Scale to 1280x720 for Twitter/GitHub compatibility
3. Add end card (3s, drawtext)
4. Crossfade between content and end card
5. Export: final_demo.mp4 (<8MB), final_demo_hd.mp4 (1080p), final_demo.gif (<10MB)

### What Would Make Someone Stop Scrolling

The first frame: a dark cockpit with 5 active terminals, each showing different colored output — green test results, cyan build logs, amber sprint planning, yellow pytest coverage, red/green k8s pod status. It looks like mission control. No other developer tool shows this.

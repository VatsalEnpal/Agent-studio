# Demo Video Production Plan

> Record a 15-20 second product demo video entirely from Claude Code. No manual editing.

## Tools Required

| Tool | Status | Install |
|------|--------|---------|
| Playwright | Already installed (devDep) | — |
| ffmpeg | Needed | `brew install ffmpeg` |
| VHS (Charm) | Optional (terminal scenes) | `brew install vhs` |

## Demo Mode (Build First)

Add `DEMO_MODE=true` env flag. Sanitizer intercepts terminal output before rendering:

```javascript
const DEMO_REPLACEMENTS = [
  [/\/Users\/\w+/g, '/Users/demo'],
  [/sk-ant-[\w-]+/g, 'sk-ant-xxxxx'],
  [/github\.com\/\w+/g, 'github.com/your-org'],
  [/vatsalbhatt\w*/gi, 'developer'],
  [/enpal/gi, 'acme-energy'],
  [/InPipeline/g, 'my-platform'],
];
```

Applied in the terminal render layer so recordings capture clean output.

## Recording Script (Playwright + Electron)

```javascript
// demo-record.mjs
const { _electron } = require('playwright');

(async () => {
  const app = await _electron.launch({
    args: ['electron/main.js'],
    env: { ...process.env, DEMO_MODE: 'true' },
    recordVideo: { dir: './demo-videos', size: { width: 1280, height: 720 } }
  });
  const window = await app.firstWindow();

  // Scene 1 (3s): App opens — dark cockpit, quick start
  await window.waitForSelector('[data-testid="sessions-tab"]', { timeout: 10000 });
  await window.waitForTimeout(3000);

  // Scene 2 (3s): Click "Start Sprint" — terminal streams
  await window.click('[data-testid="start-sprint"]');
  await window.waitForTimeout(3000);

  // Scene 3 (4s): Teams tab — sprint workflow steps lighting up
  await window.click('[data-testid="teams-tab"]');
  await window.waitForTimeout(4000);

  // Scene 4 (3s): Team Room — agents chatting
  await window.click('[data-testid="room-chat"]');
  await window.waitForTimeout(3000);

  // Scene 5 (2s): Memory tab — knowledge entries
  await window.click('[data-testid="memory-tab"]');
  await window.waitForTimeout(2000);

  // Scene 6 (3s): Terminal grid — 4 agents running
  await window.click('[data-testid="sessions-tab"]');
  await window.waitForTimeout(3000);

  await app.close(); // saves the video
})();
```

## Post-Production (all ffmpeg, all CLI)

```bash
# 1. Convert Playwright .webm to mp4
ffmpeg -i demo-videos/video.webm -c:v libx264 -crf 18 -preset slow -c:a aac raw.mp4

# 2. Trim to 18 seconds
ffmpeg -i raw.mp4 -ss 00:00:01 -t 00:00:18 -c copy trimmed.mp4

# 3. Add fade-in (first 0.5s)
ffmpeg -i trimmed.mp4 -vf "fade=t=in:st=0:d=0.5" -c:a copy faded.mp4

# 4. Create end card (3s, dark bg + title + tagline)
ffmpeg -f lavfi -i "color=c=0x0a0a0a:s=1280x720:d=3" \
  -vf "drawtext=text='Agent Studio':fontsize=56:fontcolor=0xf59e0b:\
x=(w-tw)/2:y=(h-th)/2-30:fontfile=/System/Library/Fonts/SFMono-Bold.otf,\
drawtext=text='Your AI-powered command center':fontsize=24:fontcolor=0x888888:\
x=(w-tw)/2:y=(h-th)/2+40:fontfile=/System/Library/Fonts/SFMono-Regular.otf" \
  -c:v libx264 -pix_fmt yuv420p endcard.mp4

# 5. Concatenate with crossfade
ffmpeg -i faded.mp4 -i endcard.mp4 \
  -filter_complex "[0:v]fade=t=out:st=17.5:d=0.5[v0];\
  [1:v]fade=t=in:st=0:d=0.5[v1];[v0][v1]concat=n=2:v=1[outv]" \
  -map "[outv]" joined.mp4

# 6. Add background music (ambient, 15% volume)
ffmpeg -i joined.mp4 -i music.mp3 -filter_complex \
  "[1:a]volume=0.15,afade=t=in:st=0:d=1,afade=t=out:st=19:d=1[a]" \
  -map 0:v -map "[a]" -shortest -c:v copy -c:a aac with_music.mp4

# 7. Export optimized for Twitter/GitHub
ffmpeg -i with_music.mp4 -c:v libx264 -crf 23 -preset medium \
  -vf "scale=1280:720" -r 30 -c:a aac -b:a 128k \
  -movflags +faststart -maxrate 5M -bufsize 10M final_demo.mp4
```

## Shot List (from Vatsal's brief)

| # | Duration | Shot | What to show |
|---|----------|------|-------------|
| 1 | 3s | App opens | Dark cockpit, empty state with quick start buttons |
| 2 | 3s | Start Sprint | Orchestrator session launches, terminal streams |
| 3 | 4s | Teams tab | Sprint workflow with steps lighting up (PMO → Approval → Build → QA) |
| 4 | 3s | Team Room | Agents chatting, handoffs |
| 5 | 2s | Memory tab | Knowledge entries with search |
| 6 | 3s | Terminal grid | 4 agents running in parallel |
| 7 | 2s | End card | "Agent Studio" + tagline in amber on dark bg |

## Music Sources (royalty-free, no attribution)

- Pixabay Music: https://pixabay.com/music/ (search "ambient electronic" or "tech")
- Mixkit: https://mixkit.co/free-stock-music/

## Output Locations

- Raw recording: `~/Code/AgentStudio/demo-videos/`
- Final video: `~/Code/AgentStudio/demo-videos/final_demo.mp4`
- Copy for sharing: local path for Teams/Slack
- Embed in README: GitHub supports mp4 in README via `https://github.com/user/repo/assets/...`

## README Update Plan

After demo video is approved:
1. Rewrite README.md to reflect all ShipLoop Run 3 changes (new features, bug fixes)
2. Add demo video at the top (GitHub video embed or GIF fallback)
3. Update feature list with: agent creation, sprint configuration with gates, git branch management, add server dialog, etc.
4. Update screenshots with current UI
5. Add "Quick Start" section showing the setup wizard flow

# Findings — Pre-Run Exploration

## Project Type
Web app: Next.js 16 + Express 5 + Electron 41. Terminal-first agent cockpit.

## What's Working Well
- Terminal grid with auto-layout (1-6 sessions)
- Session launcher with presets that auto-launch
- Sprint workflow player with expandable steps
- Sidebar with git status, running processes, PROD badge
- Keyboard shortcuts functional
- WebSocket reconnect with exponential backoff
- Help panel with getting started guide
- Context window indicator with color coding
- Dark/light mode toggle
- Memory tab with full CRUD and category filtering

## Known Issues (from previous runs and CLAUDE.md)
- Zombie PTY processes when closing rooms (SIGTERM but no SIGKILL fallback)
- Terminal broadcast storm (every byte to ALL WebSocket clients)
- Aggressive polling (~100 FS reads/min)
- No client-side room message cap in Zustand
- Agent Tasks: click fires fetch but no loading/error states
- Sprint resume UX unclear
- No way to create individual agents (only bulk scaffold)
- No way to create/configure sprints from UI (auto-only via PMO)
- No manual "Add Server" button in Dev Servers
- Git integration lacks branch list/create/switch
- Empty states lack helpful guidance text

## Verification Approach
- Playwright MCP for browser testing (configured in .mcp.json)
- TypeScript type-check (tsc --noEmit) after every edit
- Visual verification via browser_snapshot and browser_take_screenshot
- Dev server on port 8080 (npm run dev)

## Design Identity
Dark theme (#0a0a0a bg), Geist Mono, amber #f59e0b accent, 4px max radius, no emoji, Bloomberg density.

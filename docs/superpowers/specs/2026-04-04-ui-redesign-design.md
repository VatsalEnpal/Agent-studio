# Agent Studio v2 — Complete UI Redesign

## Product Identity

**Pitch:** "The engineering manager for your AI coding team."

Agent Studio is a team management platform, not a terminal multiplexer. Superset = parallel freelancers. Agent Studio = a real engineering team. Every design decision reinforces this.

**Three pillars:**
1. **Team Rooms** — Agents collaborate, hand off work, @mention for help
2. **Autonomous Sprints** — Gate-based workflows with human approval at each gate
3. **Shared Memory** — Agents learn and share knowledge across sessions

**Target feel:** Linear (project management) + Slack (team chat) + GitHub Actions (automated workflows)

---

## Visual Direction: Obsidian × Arc

A fusion of two directions validated during brainstorming:

- **Obsidian:** True black backgrounds, 3-column layout (icon rail + sidebar + content), tiny colored status dots, keyboard shortcut hints, zero decoration — color only for state
- **Arc-native:** Mac traffic light dots, tab-style navigation in sidebar, terminal gets the full stage

### Color System

Base palette — true black, not zinc:

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0a0a0a` | App background |
| `--bg-surface` | `#0c0c0c` | Sidebar, panels |
| `--bg-elevated` | `#111111` | Cards, hover states |
| `--bg-input` | `rgba(255,255,255,0.03)` | Input fields, search |
| `--border-default` | `rgba(255,255,255,0.04)` | Most borders |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Emphasized borders |
| `--text-primary` | `#ededed` | Headings, active items |
| `--text-secondary` | `#aaaaaa` | Body text |
| `--text-tertiary` | `#555555` | Muted, timestamps |
| `--text-ghost` | `#333333` | Placeholders, hints |

Pillar accent colors — each section has a dedicated accent that appears in active nav items, status indicators, buttons, and highlights:

| Pillar | Color | Hex | Semantic |
|--------|-------|-----|----------|
| Sessions | Green | `#3fcf6d` | Running, active, terminal |
| Team Rooms | Indigo | `#818cf8` | Collaboration, chat |
| Sprints | Amber | `#f59e0b` | Attention, gates, approval |
| Memory | Purple | `#c084fc` | Knowledge, learnings |

Each accent also has a `glow` variant (`box-shadow: 0 0 6px {color}40`) for active status dots and a `subtle` variant (`{color}10` background, `{color}15` border) for tags and badges.

### Typography

Switch from Geist to Notion's system font stack:

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
--font-mono: "SF Mono", SFMono-Regular, ui-monospace, Menlo, monospace;
```

Scale:
- Page title: 20px, weight 600, letter-spacing -0.5px
- Section heading: 13px, weight 600, letter-spacing -0.2px
- Body: 12px, weight 400
- Label: 10px, weight 600, uppercase, letter-spacing 0.8px
- Caption: 10px, weight 400

### Icons

No icon library. Custom minimal SVGs for the 5 nav rail items and ~15 common actions (plus, close, search, settings, etc.). 16×16 grid, 1.2px stroke, no fill. This gives a handcrafted feel that no library can replicate.

Additional UI indicators use Unicode/text: status dots (●), keyboard hints (⌘K), channel prefixes (#).

### Spacing & Sizing

- Base unit: 4px
- Rail width: 46px
- Sidebar width: 200px (collapsible)
- Border radius: 5-6px (cards/inputs), 7px (rail icons), 50% (status dots)
- Status dots: 5-6px diameter
- Padding: 8-10px for list items, 12-16px for panels

---

## Layout Architecture

### App Shell

```
┌─ Title Bar (Mac traffic lights + centered "Agent Studio") ─────────────┐
│ ┌─ Rail ─┐ ┌─ Sidebar ──────────┐ ┌─ Main Content ──────────────────┐ │
│ │  [A]   │ │ Tab nav (context-  │ │ Tab bar (session tabs, split)   │ │
│ │  [ses] │ │ dependent)         │ │                                  │ │
│ │  [rom] │ │                    │ │                                  │ │
│ │  [spr] │ │ Content list       │ │ Primary content area             │ │
│ │  [mem] │ │ (sessions, rooms,  │ │ (terminal, chat, dashboard,     │ │
│ │        │ │  sprints, memories)│ │  knowledge cards)                │ │
│ │        │ │                    │ │                                  │ │
│ │  [set] │ │ [Action Button]    │ │                                  │ │
│ └────────┘ └────────────────────┘ └──────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

- **Title bar:** Mac-native traffic lights (close/minimize/maximize) on left, "Agent Studio" centered in `--text-ghost` color, no other chrome
- **Icon rail:** 46px wide. Logo "A" at top, 4 section icons below, settings icon at bottom. Active section has a 2px white indicator bar on the left edge and `--bg-elevated` background. Icons use `--text-ghost` when inactive, `--text-primary` when active.
- **Sidebar:** 200px wide, collapsible with ⌘B. Content changes per section — always has a tab nav at top, a list in the middle, and an action button at the bottom. Border-right with `--border-default`.
- **Main content:** Fills remaining space. Has its own tab bar for multi-item contexts (multiple sessions, room details, sprint detail). Background is `--bg-base`.

### Command Palette (⌘K)

Overlay dialog. Same dark styling. Fuzzy search across all sections. Results grouped by section with pillar accent colors. No changes to current functionality, just visual refresh.

---

## Section Designs

### 1. Sessions (Green accent)

**Metaphor:** Your direct terminal connection to each agent. SSH feel.

**Sidebar content:**
- Tab nav: `Sessions` | `History`
- Search bar with ⌘F hint
- Grouped list: "Running" section (green dots with glow), "Paused" section (hollow dots)
- Each item shows: name, directory, time elapsed
- Bottom: white "New Session" button (high contrast CTA)

**Main content:**
- Tab bar at top showing all open sessions (like browser tabs). Active tab has green dot + underline. Inactive tabs show name only.
- Breadcrumb bar below tabs: `~/path · claude · running` + CPU/MEM stats on right
- Full terminal (xterm.js) fills the rest
- Split view (⌘D) divides terminal area horizontally or vertically

**Session launcher:** Modal dialog (not inline). Select directory, name the session, optional initial prompt. Clean form, not the current complex launcher.

### 2. Team Rooms (Indigo accent)

**Metaphor:** Slack for your AI engineering team. You're the manager watching your team collaborate.

**Sidebar content:**
- Tab nav: `Rooms` | `Agents`
- Room list with # prefix (like Slack channels): `# frontend-team`, `# api-team`, `# infra`
- Each room shows agent count and last activity time
- Active room has indigo background highlight
- Bottom: dashed border "+ New Room" button in indigo

**Main content:**
- Room header: `# room-name` with agent avatars (small colored circles with initial letters) and member count
- Chat area: Slack-style message thread
  - Each agent gets a consistent avatar (colored square with initial, color derived from agent role)
  - Messages show: avatar, agent name (in their color), timestamp, message body
  - @mentions highlighted with indigo background
  - System messages (agent joined, gate passed) as centered dividers
  - User messages right-aligned with subtle different background
- Input bar at bottom: "Message #room-name or @mention an agent..." with send hint
- Right panel (collapsible): Agent roster showing each agent's status, current task, session link

### 3. Sprints (Amber accent)

**Metaphor:** GitHub Actions meets Linear. Your CI/CD pipeline for AI workflows.

**Sidebar content:**
- Tab nav: `Active` | `Completed`
- Sprint list: each card shows sprint name, gate progress bar (mini), status pill
- Active sprints have amber indicators when gates need approval
- Bottom: "New Sprint" button

**Main content — sprint detail:**
- Header: Sprint name, status badge, created date
- **Gate pipeline visualization:** Horizontal bar showing all gates as segments
  - Green = completed, Amber = awaiting approval (pulsing), Gray = pending
  - Gate labels below: PMO → Design → Build → Test → Security → Ship
  - Click a gate to see its details
- **Active gate card:** Large card for the current gate
  - Gate name, description, which agent is assigned
  - Spec viewer: collapsible section showing the gate's specification/output
  - Two CTAs: amber "Approve Gate" button + outlined "View Spec" button
- **Activity log:** Timeline of events (agent started, file changed, gate submitted, approval given)
  - Each entry has timestamp, agent avatar, description
- **Agent roster (right panel):** Which agents are assigned to this sprint, their current gate, status

### 4. Memory (Purple accent)

**Metaphor:** Your team's wiki. What they've learned, shared across all sessions.

**Sidebar content:**
- Tab nav: `Browse` | `Search`
- Category list: All memories, Bugs & fixes, Architecture, Patterns, Conventions
- Each category shows count
- Active category has purple highlight
- Bottom: "+ Add Memory" button

**Main content:**
- Search bar at top (prominent, full-width)
- Memory cards in a list:
  - Tag badges (purple-tinted): `bug`, `pattern`, `architecture`, `convention`
  - Title (primary text), preview of content (secondary text)
  - Metadata line: "Learned by {agent} · {relative time} · from {session/room}"
- Memory detail view (click a card):
  - Full content rendered as markdown
  - Metadata sidebar: tags, source agent, source session/room, date created, times referenced
  - "Edit" and "Delete" actions

### 5. Settings

**No pillar accent — uses neutral gray.**

- Sidebar: settings categories (General, Notifications, Workspace, Automations, About)
- Main: form-based settings with clean toggle switches, inputs, and section headers
- Same dark styling, nothing special needed here

---

## Shared Components

### Notification Toast
- Slides in from top-right
- Dark background with `--border-subtle` border
- Pillar accent color on left edge (2px border-left) to indicate source
- Auto-dismiss after 5s, manual dismiss with X

### Status Dots
- 5-6px circles
- Active: filled with glow shadow
- Inactive: hollow (1px border)
- Color matches context (green for sessions, indigo for rooms, etc.)

### Buttons
- Primary: white background, black text (high contrast CTA)
- Secondary: transparent with `--border-subtle` border, `--text-secondary` text
- Accent: pillar color background, dark text (used for section-specific CTAs like "Approve Gate")
- Ghost: no border, `--text-tertiary` text, hover shows `--bg-elevated`

### Keyboard Shortcut Hints
- Tiny pills: `--bg-input` background, `--text-ghost` text, 3px border-radius
- Shown inline next to relevant actions (⌘K for search, ⌘D for split, ⌘B for sidebar)

### Empty States
- Centered in main content area
- Subtle icon (matching section), short headline, one-line description, CTA button
- No illustrations — keep it minimal

---

## What Changes From Current Codebase

### Must change (visual overhaul):
1. **globals.css:** Replace all CSS variables with new color system (true black, pillar accents)
2. **tailwind.config.ts:** Update color tokens, remove old indigo-only accent, add pillar colors
3. **layout.tsx:** Switch from Geist to system font stack
4. **nav-rail.tsx:** Redesign with custom SVG icons, active indicator bar, pillar accent colors
5. **sidebar-shell.tsx:** Add tab nav pattern, collapsible with ⌘B
6. **top-bar.tsx:** Replace with Mac-native title bar (traffic lights + centered title)
7. **status-bar.tsx:** Remove bottom status bar — info moves to breadcrumb bar in main content
8. **All Phosphor icon imports (55 files):** Replace with custom SVG components or inline SVGs
9. **session-launcher.tsx:** Simplify to clean modal form
10. **chat-message.tsx:** Redesign to Slack-style with colored agent avatars
11. **sprint-detail.tsx:** Add gate pipeline visualization, approve button redesign
12. **memory-view.tsx + memory-list.tsx:** Redesign as knowledge cards with tags
13. **command-palette.tsx:** Visual refresh only (same functionality)
14. **All component files:** Update Tailwind classes to use new tokens

### Must NOT change (preserve functionality):
- Server monolith (server/index.ts) — no backend changes
- WebSocket logic, API routes, SDK session management
- Room manager, sprint gate logic, memory CRUD
- Electron main process (electron/main.js)
- Terminal PTY handling (node-pty integration)
- All 140 passing tests — visual changes should not break test assertions on functionality

### Dependencies to add:
- None required — we're removing the icon library dependency, not adding one
- Consider: `@radix-ui/react-tabs` for the tab nav pattern (or build custom, it's simple)

### Dependencies to remove:
- `@phosphor-icons/react` — replaced by custom SVGs
- `geist` — replaced by system font stack
- `lucide-react` — already unused, clean up

---

## Light Mode

Light mode exists but is secondary. Design dark-first. Light mode inverts:
- `--bg-base`: `#ffffff`
- `--bg-surface`: `#fafafa`
- `--bg-elevated`: `#f5f5f5`
- `--text-primary`: `#111111`
- `--border-default`: `rgba(0,0,0,0.06)`
- Pillar accents stay the same but slightly darkened for contrast on white

---

## Success Criteria

1. A developer opening the app for the first time should think "this is a team management tool" not "this is a terminal"
2. Each section (sessions, rooms, sprints, memory) should be instantly distinguishable by its accent color and layout pattern
3. The UI should feel as polished as Linear or Vercel's dashboard — no "AI-generated template" energy
4. All 140 existing tests still pass
5. Zero TypeScript errors
6. Dark mode looks flawless; light mode looks acceptable

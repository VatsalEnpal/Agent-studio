# Agent Studio — Design Identity

This is NOT a generic dashboard. This is a COCKPIT for someone who runs AI agents all day.
It should feel like mission control — dense, dark, alive with information, built for power users
who also appreciate when things are beautiful.

## The Vibe

Think: Bloomberg Terminal meets Linear meets Raycast.
NOT: Notion. NOT: generic SaaS dashboard. NOT: Material Design.

- **Dark, not just dark-themed.** The darkness isn't a CSS variable — it's the identity.
  Every surface is a shade of near-black. Color is used ONLY for meaning.
- **Dense, not spacious.** Developers want information density. Don't waste space with
  oversized padding or decorative whitespace. Every pixel earns its place.
- **Alive, not static.** Status dots pulse. Terminals stream. Activity feeds flow.
  The app should feel like it's working even when you're not touching it.
- **Monospace DNA.** This is a terminal-native app. Geist Mono everywhere.
  When in doubt, make it feel like a terminal, not a web app.

## Color — Meaning, Not Decoration

Colors are semantic. They MEAN something. Never use color decoratively.

| Color | Hex | Meaning | Use for |
|-------|-----|---------|---------|
| Background | #0a0a0a | The void | Page background |
| Surface | #111111 | A panel exists here | Cards, panels, modals |
| Border | #1a1a1a | Separation | Dividers, panel borders |
| Subtle text | #666666 | Secondary information | Timestamps, metadata, hints |
| Default text | #e5e5e5 | Primary content | Body text, labels |
| Bright text | #ffffff | Emphasis | Headings, active items |
| Amber | #f59e0b | Attention / active | Active states, primary actions, focus rings |
| Green | #4ade80 | Success / running | Active sessions, passing tests, healthy status |
| Red | #ef4444 | Error / danger | Failed states, destructive actions, errors |
| Blue | #3b82f6 | Information / link | Links, informational badges |

**No purple. No gradients. No shadows for decoration. No glassmorphism.**

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Everything | Geist Mono | 400 (body), 500 (labels), 600 (headings) | Relative to context |
| Terminal | Geist Mono or system monospace | 400 | 13px |

**One font family for everything.** The monospace font IS the brand.
No font mixing. No serif anywhere. No sans-serif alternatives.

Sizes create hierarchy:
- Page title: 20px, weight 600
- Section header: 14px, weight 500, uppercase, letter-spacing 0.05em, color #666
- Body: 13px, weight 400
- Caption/metadata: 11px, weight 400, color #666

## Spacing

- Base unit: 4px
- Component padding: 8px (compact) or 12px (comfortable)
- Section gaps: 16px
- Page padding: 16px on sides, 12px top

**Compact by default.** This is a power tool, not a marketing page.
A developer should see maximum information without scrolling.

## Size Reference (Exact Pixels)

These are the EXACT sizes. Don't deviate without reason.

| Element | Size | Notes |
|---------|------|-------|
| Body text | 13px | The default for everything |
| Section headers | 14px | Uppercase, letter-spacing 0.05em, #666 |
| Page titles | 20px | Weight 600 |
| Caption/metadata | 11px | #666 |
| Default icons | 16px | Lucide React `size={16}` |
| Primary action icons | 20px | New session, create room buttons |
| Status dots | 8px | Pulsing when active |
| Buttons height | 28px | Compact |
| Button text | 12px | Monospace |
| Button padding | 8px 12px | Tight |
| Icon-only touch targets | 32x32px | Even if icon is 16px — padding makes up the difference |
| Sidebar width | 200px | Collapsible |
| Terminal header bar | 28px | Thin strip above each terminal |
| Modal max-width | 480px forms / 640px content | |
| Border radius | 4px max | Never more than 4px. Ever. |

**The golden rule: if two adjacent elements have noticeably different text sizes and they shouldn't, something is wrong.** Heading/body/caption is a 20/13/11 system. Don't add random 16px or 18px text.

## Components — How They Should Feel

### Session Cards
Tight. Status dot (8px, pulsing if active) + name (truncated, 13px) + model badge (tiny, muted) + cost (right-aligned, tabular nums). 
One line per session. Not cards with borders — just rows in a list.
Active session: left border 2px amber. Hover: bg #1a1a1a.

### Terminal Panes
Full bleed. No decorative borders around terminals. Just the terminal itself
with a thin (28px) header bar: status dot + name + model + cost + context% + actions.
The terminal IS the app. Everything else gets out of its way.

### Buttons
Small (28px height), tight padding (8px 12px), monospace text, 12px font.
Primary: amber bg, black text. Secondary: transparent, border #333, text #999.
Destructive: transparent, border red, text red. On hover, fill.
No rounded corners > 4px. No shadows. No gradients.

### Empty States
Centered, subdued. Small icon (24px, #666), one line of text (#999, 13px),
one small button (secondary style). No illustrations. No emoji. No exclamation marks.
Tone: matter-of-fact. "No sessions running. Start one." Not "Oops! Nothing here yet!"

### Error Messages
Inline, red left border (2px), dark red bg (#1c0a0a), text in default color.
Always include WHAT went wrong and WHAT TO DO about it.
"WebSocket disconnected. Reconnecting in 3s..." not "Connection error."

### Loading States
Subtle. A thin amber line at the top of the loading panel (like YouTube's loading bar).
Or a skeleton with #1a1a1a blocks on #111 background. No spinners unless absolutely needed.
The app should never feel frozen — something should always be moving.

### Modals
Dark (#111 bg), no backdrop blur (it's already dark), tight padding,
monospace throughout. Close with Esc. Always closeable.
Max width 480px for forms, 640px for content.

### Toasts
Bottom-right, slide in from right, auto-dismiss in 4s.
Dark bg (#1a1a1a), thin left border colored by type (green/red/amber).
One line. Dismissable by click.

## Animation Philosophy

- **Fast.** 150ms for micro-interactions (hover, focus). 200ms for transitions (tab switch, panel open). 300ms max for anything.
- **Ease-out only.** Things arrive quickly, settle slowly. `cubic-bezier(0, 0, 0.2, 1)`.
- **Purposeful.** Only animate things that help the user understand what changed.
  Status dot pulses → "this is alive." Activity feed slides in → "new thing appeared."
  Don't animate decoratively.
- **Respect `prefers-reduced-motion`.** All animations wrapped in media query.

## Voice & Tone

The app speaks like a competent colleague, not a customer support bot.

| Situation | DO | DON'T |
|-----------|-----|-------|
| Empty state | "No sessions running. Start one." | "Oops! Nothing here yet! Get started by creating your first session!" |
| Error | "Server unreachable. Check if npm run dev is running." | "Something went wrong. Please try again later." |
| Success | "Session started." (toast, 4s) | "Your session has been successfully created!" |
| Destructive | "Kill session? This can't be undone." | "Are you sure you want to proceed with this action?" |
| Labels | "Sessions" / "Teams" / "Memory" | "My Sessions" / "Team Management" / "Knowledge Base" |

**Short. Direct. No filler words. No exclamation marks. No emoji in the UI.**

## What Makes Agent Studio Look Like Agent Studio

1. **The monospace everything.** No app looks like this. It's a terminal that grew a UI.
2. **The amber accent.** One warm color in a sea of dark grays. Distinctive.
3. **The density.** More information per pixel than any competitor.
4. **The terminal-first layout.** Terminals take 80% of the screen. Everything else serves them.
5. **The silence.** No decorative elements. No illustrations. No gradients. Just data.

If you're making a design decision and aren't sure, ask: "Would this feel at home in a terminal?"
If yes → do it. If no → reconsider.

# Agent Studio — Product Empathy Checklist

## IMPORTANT: This Is a Safety Net, Not the Main Test

The MAIN test is open exploration — walk through the app as a real user, discover
problems naturally, document everything you find. This checklist is the SECONDARY
pass to catch anything the exploration missed.

DO NOT just run through this list mechanically. First explore. Then cross-check.

Any issue you discover during exploration that isn't covered here:
ADD IT to the relevant section with [AUTO-ADDED, run-N] tag.

This checklist should be LARGER at the end of each run than at the start.

## How to Use

1. FIRST: Explore the entire app freely as a new user (see PROMPT.md Brain 1)
2. THEN: Cross-check against this list for anything you missed
3. Every "no" becomes a task with severity
4. After each run: add new questions for gaps you discovered during exploration
5. After 5+ runs: prune [AUTO-ADDED] items that never caught anything

## Severity Rules

- CRITICAL: User cannot accomplish a core action at all
- HIGH: User would be confused, lost, or frustrated within 30 seconds
- MEDIUM: Missing polish that a professional product would have
- LOW: Nice-to-have that improves delight but doesn't block usage

---

## 0. First 60 Seconds (A Stranger Opens This App)

### First Impression

- [ ] Does the app explain what it is within 3 seconds of opening? (tagline, welcome, or obvious context)
- [ ] Is there a setup wizard or getting-started flow for first-time users?
- [ ] Can a new user get productive (launch their first session) within 2 minutes?
- [ ] Is there a help/docs/how-to link visible without searching?
- [ ] Does the app look professional? (consistent spacing, aligned elements, no visual jank)
- [ ] Is the color scheme consistent across all screens? (no random mismatched colors)
- [ ] Does the font feel intentional? (not default browser font, not too many font sizes)
- [ ] Is the app name and branding visible?

### Navigation

- [ ] Does the Help dialog features list match the actual tabs in the navigation? [AUTO-ADDED, run-1]
- [ ] Are all top bar indicators (usage, limits, peak hours) labeled or explained? [AUTO-ADDED, run-1]
- [ ] Can the user tell what each top-level tab does from its label alone?
- [ ] Is the current tab clearly highlighted/active?
- [ ] Do all navigation elements respond to clicks? (no dead links)
- [ ] Is keyboard navigation possible? (Tab cycles through elements, Enter activates)

### What If I Have Nothing?

- [ ] If no sessions exist: is there an empty state with a CTA to create one?
- [ ] If no teams/rooms exist: does it explain what teams are and how to start?
- [ ] If no memory entries exist: does it say something helpful, not just blank?
- [ ] If no git repos are configured: does it guide the user to set one up?

---

## 1. Sessions Tab

### Launching Sessions

- [ ] Is the "+ New Session" button immediately visible?
- [ ] Does the launcher modal explain each option? (model, agent, permissions — not just dropdowns)
- [ ] Can I launch a session with one click from a preset? (Quick Chat, Sprint, etc.)
- [ ] Does the session start within 3 seconds of clicking launch?
- [ ] Is there a loading indicator while the session initializes?
- [ ] If the session fails to start, is there an actionable error message?

### Session List & Identification

- [ ] Can I tell sessions apart from their names? (not all "energy-business-automation-biz-ops")
- [ ] Are session names human-readable? (descriptive, not branch names or UUIDs)
- [ ] Can I rename a session?
- [ ] Can I see which model each session is using at a glance? (badge or label)
- [ ] Can I see the cost of each session?
- [ ] Is per-session cost visible in the sidebar session list (not just total in top bar)? [AUTO-ADDED, run-2]
- [ ] Can I see how full the context window is?
- [ ] Is there a visual status indicator? (active = green, idle = gray, error = red)
- [ ] Are sessions grouped logically? (sprint team vs standalone)

### Session History

- [ ] Can I see past/completed sessions, not just active ones?
- [ ] Can I resume a previous session from the UI?
- [ ] Can I search/filter session history?
- [ ] Is the history sorted by recency by default?

### Terminal Grid

- [ ] Do terminals render text correctly? (no garbled characters, no blank canvases)
- [ ] Is terminal text readable at default zoom? (font size, contrast)
- [ ] Can I resize terminal panes by dragging borders?
- [ ] Can I fullscreen a terminal? (and exit fullscreen with Esc)
- [ ] Can I type into a terminal and see output? (basic I/O works)
- [ ] Is there visible lag between typing and output appearing? (should be <100ms)
- [ ] Do multiple terminals (4-6) work simultaneously without freezing?
- [ ] Can I scroll up in terminal history?

### Process Visibility

- [ ] Can I see ALL Claude Code sessions running on my machine? (not just ones started from here)
- [ ] Can I see all servers/ports currently exposed?
- [ ] Can I kill a session from the UI with confirmation?

---

## 2. Teams Tab

### Room/Sprint Creation

- [ ] Is there a visible "Create" button for new rooms or sprints?
- [ ] Can I create a sprint from the UI? (not just view existing ones)
- [ ] Does the creation flow explain what I'm creating?
- [ ] Can I name my sprint/room something meaningful?
- [ ] Can I select which agents to include?

### Sprint Visualization

- [ ] Can I see multiple sprints at once? (list or horizontal layout)
- [ ] Is the current step of each sprint clearly highlighted?
- [ ] Can I distinguish completed vs in-progress vs pending steps?
- [ ] Is the typography varied enough to create visual hierarchy? (not all same size)
- [ ] Can I expand/collapse sprint details?
- [ ] Is the spec readable without horizontal scrolling?

### Agent Display

- [ ] Are agent avatars/icons large enough to identify at a glance?
- [ ] Can I see which agent is doing what right now?
- [ ] Can I click an agent to jump to its terminal session?
- [ ] Is the agent's status clearly indicated? (working, idle, blocked, error)

### Room Interaction

- [ ] Can I chat with agents in a room?
- [ ] Does the chat work reliably? (messages send, responses appear)
- [ ] Can I close a room? Does it actually clean up? (no zombie processes)
- [ ] Does closing a room show a confirmation dialog before destroying it? [AUTO-ADDED, run-1]
- [ ] If I reopen the app, do rooms restore their state?
- [ ] Is it clear what the message count number next to each room name means? [AUTO-ADDED, run-1]

### Controls

- [ ] Is the Teams view accessible from the main navigation, not just the command palette? [AUTO-ADDED, run-1*]
- [ ] Is it clear what 'WORKFLOWS' means and how to create one? [AUTO-ADDED, run-1*]

- [ ] Can I pause a sprint/run?
- [ ] Can I resume a paused sprint?
- [ ] Can I cancel a sprint that's going wrong?
- [ ] Are these controls visible and discoverable?

---

## 3. Memory Tab

### Browsing

- [ ] Can I see all memory entries?
- [ ] Can I search memory by keyword?
- [ ] Can I filter by category? (learnings, corrections, decisions)
- [ ] Are memory entries sorted meaningfully? (by date, relevance, category)
- [ ] Can I click an entry to see full details?

### Usefulness

- [ ] Does the detail view show enough context to understand the memory?
- [ ] Can I tell which agent created each memory?
- [ ] Can I tell when each memory was created?
- [ ] Can I delete or archive outdated memories?

---

## 4. Settings Tab

### Configuration

- [ ] Can I set a default model for new sessions?
- [ ] Can I set default permissions?
- [ ] Can I configure keyboard shortcuts?
- [ ] Can I see and manage workspace/project paths?

### Notifications

- [ ] Can I turn off Mac notifications entirely?
- [ ] Can I turn off notifications per-type? (rooms vs sprints vs errors)
- [ ] Can I configure Telegram notifications separately from Mac?
- [ ] Is there a way to reduce notification frequency? (batch, digest, etc.)

### System

- [ ] Are notification settings persisted server-side (not lost when browser closes)? [AUTO-ADDED, run-1*]
- [ ] Is it clear what 'PMO Scheduler' means and what scans do? [AUTO-ADDED, run-1*]
- [ ] Is there an Automations section in settings? [AUTO-ADDED, run-1*]

- [ ] Can I see CPU/RAM/disk usage?
- [ ] Can I see all running processes related to Agent Studio?
- [ ] Is the system monitor accurate and updating?

### Help & Onboarding

- [ ] Is there a "How To" or getting-started guide accessible from Settings?
- [ ] Is there a keyboard shortcuts reference?
- [ ] Is there a link to documentation/README?
- [ ] Is there an "About" section with version number?

---

## 5. Sidebar

### Git Integration

- [ ] Can I see git status for my repos?
- [ ] Can I see which branch I'm on?
- [ ] Can I see uncommitted changes?
- [ ] Can I push to a remote from here?
- [ ] Can I merge branches from here?
- [ ] Can I create a PR from here?
- [ ] Is the PROD badge clearly visible for production repos?

### Dev Servers

- [ ] Can I see running dev servers?
- [ ] Can I start/stop a dev server from here?
- [ ] Can I add a new port/server?
- [ ] Can I see which port each server is on?

### Layout

- [ ] Can I toggle the sidebar open/closed?
- [ ] Does the sidebar remember its state between sessions?
- [ ] Is the sidebar content organized with clear section headers?
- [ ] Is the SERVERS count in the sidebar header accurate (running vs total)? [AUTO-ADDED, run-1*]
- [ ] Does the setup wizard have a close/dismiss button that works at any step? [AUTO-ADDED, run-1*]

---

## 6. Cross-Cutting Concerns

### Performance

- [ ] Does the app load in under 3 seconds?
- [ ] Is there any visible lag when switching tabs?
- [ ] Do WebSocket connections stay stable for 10+ minutes?
- [ ] Is CPU usage reasonable when idle? (<10%)

### Error Handling

- [ ] When the backend is down, does the app show a helpful error? (not blank screen)
- [ ] When a WebSocket disconnects, does it show "Reconnecting..." and auto-recover?
- [ ] When a file is missing, does only the affected panel show an error? (not the whole app)
- [ ] Are there console errors in the browser dev tools during normal usage?

### Keyboard Shortcuts

- [ ] Does Cmd+N open the session launcher?
- [ ] Does Cmd+K open the command palette?
- [ ] Does Cmd+\ toggle the sidebar?
- [ ] Does Esc close modals/fullscreen?
- [ ] Does Cmd+1-6 focus the corresponding terminal?
- [ ] Are shortcuts discoverable? (shown in tooltips, help panel, or bottom bar)

### Responsive

- [ ] Does the app work on a 13" laptop screen? (1280px width)
- [ ] Does the app work on an external monitor? (1920px+)
- [ ] Does the layout adjust gracefully when resizing?
- [ ] Is text readable at all supported screen sizes?

---

## 7. Design Identity (Does This Look Like Agent Studio?)

### Brand Consistency

- [ ] Is the background #0a0a0a everywhere? (no white or light gray leaks)
- [ ] Is Geist Mono the ONLY font? (no Inter, Roboto, Arial, system sans-serif)
- [ ] Is amber (#f59e0b) the ONLY accent color? (no random blues, purples, or other accents)
- [ ] Are colors used semantically? (green=success, red=error, amber=active — never decorative)
- [ ] Is there any decorative element that doesn't convey information? (gradients, illustrations, shadows for style)

### Visual Sizing & Proportions

- [ ] Are ALL icons at least 16px? (no icons smaller than 16px — they become unreadable)
- [ ] Are primary action icons 20px? (new session, create room, etc.)
- [ ] Is body text consistently 13px? (not jumping between 12px and 16px randomly)
- [ ] Are section headers consistently 14px uppercase? (not oversized 18-24px headings)
- [ ] Is caption/metadata text 11px? (not the same size as body text)
- [ ] Are status dots 8px? (visible but not dominant)
- [ ] Are buttons consistently 28px height? (not mixing 32px and 24px randomly)
- [ ] Are icon-only buttons at least 32x32px touch target? (even if the icon is 16px)
- [ ] Is there any text that feels disproportionately large compared to its neighbors?
- [ ] Is there any element that's hard to see or click because it's too small?

### Dark Mode Consistency

- [ ] Is the app dark everywhere? (no white or light gray panels/backgrounds leaking through)
- [ ] Are there any Radix UI default styles showing light backgrounds? (modals, dropdowns, tooltips)
- [ ] Are scrollbars dark? (not bright white system scrollbars)
- [ ] Are input fields dark? (not white text fields from browser defaults)
- [ ] Are select/dropdown menus dark? (not default light browser dropdowns)
- [ ] Is the command palette dark?
- [ ] Are all third-party component backgrounds overridden to dark? (Radix, xterm, etc.)
- [ ] Does the app look consistent when macOS is in light mode? (the app should still be dark)

### Terminal-First Feel

- [ ] Do terminals take 80%+ of the Sessions screen? (everything else gets out of the way)
- [ ] Does the app feel dense? (more info per pixel than a typical web app)
- [ ] Is spacing compact? (8-12px padding, not 24-32px like a marketing site)
- [ ] Do components feel like terminal UI? (tight rows, monospace text, no rounded corners > 4px)
- [ ] Is the overall information density high? (a power user should see a lot without scrolling)

### Voice & Tone

- [ ] Are empty states matter-of-fact? ("No sessions running. Start one." NOT "Oops! Nothing here yet!")
- [ ] Are error messages helpful? (include what went wrong AND what to do)
- [ ] Are success messages short? ("Session started." NOT "Your session has been successfully created!")
- [ ] Is destructive confirmation direct? ("Kill session? Can't be undone." NOT "Are you sure you want to proceed?")
- [ ] Is there any emoji in the UI? (there shouldn't be)
- [ ] Is there any exclamation mark in UI text? (there shouldn't be)

### Animation & Polish

- [ ] Do status dots pulse when active?
- [ ] Does the favicon change color based on status? (green/yellow/red)
- [ ] Does the tab title show attention count? ("(3) Agent Studio")
- [ ] Are animations fast? (150-200ms, not 300-500ms)
- [ ] Does the app respect `prefers-reduced-motion`?

---

## 8. The Autoresearch Questions (Self-Generating)

These aren't specific checks — they're META-QUESTIONS that prompt the QA agent
to DISCOVER new checklist items. After answering these, any new findings should be
added to the relevant section above with [AUTO-ADDED, run-N] tag.

- [ ] Walk through the app as if you've never seen it. What confused you first?
- [ ] Try to accomplish each core task WITHOUT reading any documentation. Where did you get stuck?
- [ ] Look at every piece of text on every screen. Is any of it jargon that a non-developer wouldn't understand?
- [ ] Look at every icon. Is any icon used without a label, where the meaning isn't obvious?
- [ ] Try every button, link, and interactive element. Do any of them do nothing?
- [ ] Try entering unexpected input everywhere — very long text, special characters, empty strings. What breaks?
- [ ] Resize the browser window to different sizes. What breaks or overflows?
- [ ] Leave the app running for 5 minutes doing nothing. Does anything degrade? (memory leak, CPU spike, disconnects)
- [ ] Open the browser dev tools console. Are there any errors or warnings during normal usage?
- [ ] Navigate away from the app and come back. Is state preserved?

---

## Checklist Evolution Log

Track additions and removals here.

| Run | Items Added   | Items Removed | Miss Category | Health Score |
| --- | ------------- | ------------- | ------------- | ------------ |
| 0   | 173 (initial) | 0             | N/A           | Baseline     |
| 1   | 4             | 0             | checklist_gap | 88           |
| 2   | 1             | 0             | checklist_gap | 91           |
| 1*  | 7             | 0             | checklist_gap | 78           |

## Miss Categories (for auto-evolution)

When the QA loop finds a bug that the checklist DIDN'T catch, categorize why:

- `checklist_gap` — the right question wasn't in the checklist
- `visual_blindspot` — the check exists but the AI couldn't evaluate it visually
- `edge_case` — the check exists for the happy path but not this edge case
- `data_dependent` — the issue only appears with specific data states
- `interaction_sequence` — the issue only appears after a specific sequence of actions
- `timing` — the issue is intermittent or timing-dependent
- `assumption` — the checklist assumed something that isn't true

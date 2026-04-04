# Agent Studio v2 — Testing & Validation Strategy

> Every feature works, every time, for every user who installs it.
> No exceptions. No "works on my machine." No "usually works."

---

## Philosophy: Reverse-Plan from "It Works Perfectly"

Start from the end state: a user installs Agent Studio, opens it, and every button, every terminal, every room, every sprint works first try. Work backwards to figure out what must be true for that to happen.

**The chain**: User installs → Electron launches → Server starts → UI loads → Features work → Edge cases handled → Crash recovery works → Updates don't break things.

Every link in that chain gets its own test layer.

---

## Test Layers (7 Layers, Bottom to Top)

```
Layer 7: Smoke Tests (every build, 30 seconds)
Layer 6: User Journey Tests (every PR, Playwright E2E)
Layer 5: Chaos & Resilience Tests (weekly, kill processes, corrupt files)
Layer 4: Performance Tests (every PR, latency thresholds)
Layer 3: Integration Tests (every PR, API + WebSocket + filesystem)
Layer 2: Component Tests (every PR, React component rendering)
Layer 1: Unit Tests (every save, pure functions + managers)
```

Each layer catches what the layer below misses. If a bug reaches Layer 7 (smoke tests), every layer below it failed.

---

## Layer 1: Unit Tests

**What**: Pure functions, data transformers, parsers, utilities. No I/O, no filesystem, no network.

**Framework**: Vitest (already in the JS/TS ecosystem, fast, compatible with Next.js).

**Coverage target**: 100% of exported functions in these modules:

### Server utilities
| Function | File | Test cases |
|----------|------|-----------|
| `parseAgentFrontmatter(md)` | `routes/agents.ts` | Valid YAML, missing fields, no frontmatter, malformed YAML, empty file |
| `stripAnsiCodes(text)` | `utils/ansi.ts` | All ANSI escape patterns, nested codes, clean text passthrough, unicode preservation |
| `parseContextUsage(sessionDir)` | `utils/usage.ts` | Valid session files, missing files, corrupted JSON, zero usage, 100% usage |
| `calculateHealthScore(bugs)` | `managers/sprint-manager.ts` | Zero bugs = 100, P0 = -25, mixed severities, empty array, all P0s = 0 (not negative) |
| `filterSdkMessage(event)` | `managers/sdk-session-manager.ts` | thinking → drop, tool_use → drop, tool_result → drop, text_delta → accumulate, turn_end → emit |
| `parseSprintState(json)` | `managers/sprint-manager.ts` | Valid state, missing gates, invalid status values, null sprint, version mismatch |
| `parseMentions(text)` | `routes/rooms.ts` | `@backend` → backend, `@all` → all, no mentions → orchestrator (default), multiple mentions → first, `@@double` → skip |
| `computeSessionCard(session, usage)` | `utils/session.ts` | Active/idle/exited states, context % color thresholds (0/49/50/79/80/100), cost formatting, time-since formatting |
| `circularBufferWrite(buffer, data)` | `managers/terminal-manager.ts` | Write within capacity, write at boundary, overwrite old data, read after wraparound, empty buffer read |
| `atomicWriteSync(path, data)` | `utils/fs.ts` | Successful write, directory doesn't exist, permission denied, disk full (mock), concurrent writes |
| `parseGitStatus(stdout)` | `workers/git-worker.ts` | Clean repo, dirty files, ahead/behind, detached HEAD, no remote, binary files |
| `validateConfig(json)` | `routes/config.ts` | Valid config, missing required fields, extra unknown fields, invalid paths, empty projects array |

### Frontend utilities
| Function | File | Test cases |
|----------|------|-----------|
| `formatCost(dollars)` | `lib/utils.ts` | 0.001 → "$0.00", 1.5 → "$1.50", 100.999 → "$101.00", null → "$0.00" |
| `formatDuration(ms)` | `lib/utils.ts` | 0 → "just now", 59999 → "59s", 60000 → "1m", 3600000 → "1h", 86400000 → "1d" |
| `contextColor(percent)` | `lib/utils.ts` | 0-49 → green, 50-79 → yellow, 80-100 → red, null → gray, >100 → red |
| `statusDotColor(status)` | `lib/utils.ts` | active → green, idle → yellow, exited → gray, building → blue, unknown → gray |
| `groupSessionsByDate(sessions)` | `lib/utils.ts` | Today, Yesterday, This Week, Older. Empty array. All same day. Timezone boundary. |

**Run**: On every file save (Vitest watch mode). CI runs full suite.

---

## Layer 2: Component Tests

**What**: React components render correctly with given props. No real server, no real WebSocket — mocked data.

**Framework**: Vitest + React Testing Library + jsdom.

**Every component gets**:
1. **Renders without crashing** with default/minimal props
2. **Renders correctly** with realistic data
3. **Handles empty state** (no sessions, no rooms, no memories)
4. **Handles error state** (failed to load, network error)
5. **Handles loading state** (spinner/skeleton shown)
6. **User interaction** (click, type, hover — fires expected callbacks)

### Critical components to test

| Component | Key test cases |
|-----------|---------------|
| `SessionCard` | All status states (active/idle/exited/building), context % color coding, name editing, cost display, click fires onSelect |
| `TerminalPane` | Mounts xterm.js without error, receives data via mock, sends input via mock, handles resize, cleanup on unmount |
| `SessionLauncher` | All presets fill form correctly, custom fields validate, launch fires with correct args, resume dropdown shows sessions, Cmd+Enter submits |
| `RoomChat` | Messages render as markdown, typing indicator shows during agent work, messages appear in order, scroll to bottom on new message, @mention dropdown filters correctly |
| `ChatMessage` | Agent name + avatar + timestamp rendered, markdown rendered (code blocks, links, bold), expandable detail panel toggles, approval buttons show for approval-request type |
| `SprintList` | Active/Completed/Planned sections render, progress bar reflects gate completion, click selects sprint |
| `SprintDetail` | Gates render with correct status, agent list shows status, handoffs list is clickable, QA report score renders with color, logs render chronologically |
| `GateCard` | All states (WAITING/IN_PROGRESS/PASSED/FAILED), checklist items show status, Approve button shows only when ready |
| `MemoryList` | Search filters entries, category pills filter, pinned toggle works, empty state shows when no results |
| `MemoryDetail` | Renders observation/action/outcome/lesson, tags render as badges, superseded indicator shows |
| `RepoCard` | Branch name, dirty/clean, ahead/behind, PR/Push buttons, PROD badge |
| `ServerCard` | Running/stopped state, port display, Start/Stop/Open buttons |
| `TopBar` | Session count, CPU/RAM, notification bell badge, theme toggle |
| `NavRail` | 5 icons, active page highlight, notification badges |
| `NotificationToast` | Renders all notification types (gate approval, @mention, error, sprint complete), dismiss works, action buttons work |

**Run**: On every PR. ~5 second run time target.

---

## Layer 3: Integration Tests

**What**: Real server, real filesystem, real WebSocket — but no real Claude Code CLI (mocked). Tests the full API + event pipeline.

**Framework**: Vitest + supertest (HTTP) + ws (WebSocket client) + tmp directories.

**Setup**: Each test suite gets a fresh temp directory with a mock `.agent-studio.json`, mock `.claude/agents/`, and mock `ai-agents/` structure. Server starts on a random port. Tears down completely after each suite.

### API endpoint tests

| Endpoint | Test cases |
|----------|-----------|
| `GET /api/config` | Returns valid config, handles missing file gracefully, returns defaults when empty |
| `POST /api/config` | Saves config, validates schema, rejects invalid, atomic write (no corruption on concurrent write) |
| `GET /api/agents` | Discovers agents from .claude/agents/, handles empty directory, handles malformed .md files, caches results |
| `GET /api/sessions` | Returns all sessions, includes usage data, sorts by recency |
| `POST /api/sessions` | Creates session (mocked PTY), returns session ID, rejects invalid args, enforces spawn limit queue |
| `DELETE /api/sessions/:id` | Kills session, cleans up PTY, removes from list, handles already-exited session |
| `GET /api/sessions/:id/buffer` | Returns terminal buffer, handles unknown session, returns empty for new session |
| `POST /api/rooms` | Creates room, validates agents exist, persists to disk |
| `POST /api/rooms/:id/messages` | Adds message, routes @mention correctly, handles @all, handles offline agent, deduplicates by clientId |
| `POST /api/rooms/:id/spawn` | Spawns SDK sessions for agents, skips already-spawned, sends init message to orchestrator |
| `GET /api/sprints` | Returns active + planned + archived sprints from filesystem |
| `POST /api/sprints/:id/approve-gate` | Advances gate state, validates gate is ready, persists to state.json |
| `GET /api/memory/entries` | Returns entries from memory index, handles missing index, handles corrupt index |
| `GET /api/memory/entry?file=...` | Returns full memory file, rejects path traversal (../../etc/passwd), handles missing file |
| `POST /api/memory/entries` | Creates memory file + updates index, validates schema, atomic write |
| `GET /api/git/status` | Returns status for all projects (async, not blocking), handles missing repos, handles permission errors |
| `POST /api/git/pr` | Creates PR via gh CLI, validates branch exists, handles prod repo confirmation |
| `POST /api/servers/:name/start` | Starts dev server, tracks PID, detects port conflict |
| `POST /api/servers/:name/stop` | Stops dev server, kills process tree, cleans up PID |

### WebSocket integration tests

| Scenario | Test |
|----------|------|
| **Connect** | Client connects, receives initial state (sessions, rooms) |
| **Reconnect** | Client disconnects, reconnects within 15s, state is consistent |
| **Terminal data flow** | Send terminal-input → server receives → mock PTY echoes → terminal-data sent back → client receives |
| **Session lifecycle** | Create session → sessions-update broadcast → kill session → sessions-update broadcast → session removed |
| **Room message flow** | Send message → room-message broadcast → agent typing indicator → agent response → room-message broadcast |
| **Sprint state change** | Modify state.json on disk → file watcher triggers → sprint-update broadcast → client receives new gate state |
| **Memory update** | Write new memory file → file watcher triggers → memory-update broadcast |
| **Broadcast error resilience** | One client has slow connection → broadcast doesn't crash → other clients still receive |
| **Rate limiting** | Client sends 100 messages in 1 second → server handles gracefully (no crash, no memory leak) |

### Filesystem integration tests

| Scenario | Test |
|----------|------|
| **Atomic write** | Write config while reading → no corruption |
| **Concurrent agent writes** | Two "agents" write memory files simultaneously → both files exist, index has both |
| **File watcher reliability** | Create file → watcher fires within 500ms. Delete file → watcher fires. Modify file → watcher fires with correct content |
| **Sprint state persistence** | Write state.json → restart server → state.json loaded correctly |
| **Room persistence** | Create room with messages → restart server → room and messages intact |
| **Path traversal prevention** | Memory endpoint rejects `../../etc/passwd`, `..%2F..%2F`, URL-encoded paths |
| **Missing directories** | Server starts even if `ai-agents/memory/` doesn't exist → creates directories lazily |
| **Large memory index** | 500+ entries in memory_index.json → loads in <100ms, search in <50ms |

**Run**: On every PR. ~30 second run time target.

---

## Layer 4: Performance Tests

**What**: Measurable thresholds that must pass. If typing latency exceeds 50ms, the test fails. Period.

**Framework**: Custom benchmarks using `performance.now()` + Vitest assertions.

### Thresholds

| Metric | Threshold | How to measure |
|--------|-----------|---------------|
| **Typing latency** (keystroke → rendered) | < 50ms | Send terminal-input via WebSocket, measure time until terminal-data comes back |
| **Session switch time** | < 100ms | Detach terminal A, attach terminal B, measure time until first paint |
| **Server startup** | < 3 seconds | Time from `tsx server/index.ts` to `/api/config` responding 200 |
| **WebSocket broadcast** (100 clients) | < 10ms per broadcast | Create 100 mock clients, send one broadcast, measure time for all to receive |
| **Memory index load** (500 entries) | < 100ms | Create 500-entry index, measure load + parse time |
| **Git status poll** (5 repos) | < 2 seconds | Poll 5 real repos async, measure total wall time |
| **Room message delivery** | < 200ms | Send message via API, measure time until WebSocket broadcast received |
| **Sprint state file parse** | < 50ms | Parse a realistic state.json with 3 gates, 5 agents |
| **Terminal buffer replay** (50k lines) | < 500ms | Fill circular buffer with 50k lines, read all, measure time |
| **Electron cold start** | < 5 seconds | From app launch to UI interactive (splash → main window visible) |
| **Memory usage per session** | < 50MB | xterm.js instance + 50k line buffer per session. Measure with 6 sessions in memory. |
| **WebSocket reconnect** | < 2 seconds | Kill server, restart, measure time until client reconnects and resynchronizes |

### Memory leak tests

| Test | How |
|------|-----|
| **Terminal session leak** | Create 20 sessions, kill all 20, check heap — should return to baseline ±10% |
| **Room message leak** | Send 1000 messages to a room, check heap — should stabilize (not grow linearly) |
| **WebSocket client leak** | Connect/disconnect 100 clients, check server heap — should return to baseline |
| **File watcher leak** | Create/delete 50 watched files, check watcher count — should match active files only |
| **xterm.js instance leak** | Switch between 10 sessions 100 times, check DOM nodes — should be constant (1 terminal attached) |

**Run**: On every PR. ~60 second run time target.

---

## Layer 5: Chaos & Resilience Tests

**What**: Break things on purpose. Kill processes, corrupt files, flood connections. The app must survive or recover gracefully.

**Framework**: Custom scripts + Vitest.

### Process chaos

| Scenario | Expected behavior | Test |
|----------|------------------|------|
| **Server crash mid-session** | Electron restarts server, WebSocket reconnects, terminal buffer replayed from backup | Kill server PID, verify Electron restarts it, verify client reconnects |
| **PTY process dies** | Session shows "exited" status, no zombie process, user notified | Kill PTY PID directly, verify session status updates, verify PID is gone |
| **SDK session hangs** | 30-second timeout fires, session marked failed, error emitted to room | Mock SDK that never responds, verify timeout + error message |
| **tree-kill fails** | Fallback to SIGKILL, then force-remove from session map | Mock tree-kill returning error, verify escalation + cleanup |
| **Port in use on startup** | Server finds next free port, Electron connects to new port | Occupy port 8080, start server, verify it finds 8081+ |
| **Dev server crashes** | Server card shows "crashed," PID cleaned up, port freed | Start dev server, kill its PID, verify status update |
| **All sessions killed at once** | All cleaned up, no zombies, server stable | Create 6 sessions, kill server, restart, verify zero orphaned processes |

### Filesystem chaos

| Scenario | Expected behavior | Test |
|----------|------------------|------|
| **state.json corrupted** | Server loads defaults (idle state), logs warning, doesn't crash | Write garbage to state.json, verify server starts cleanly |
| **memory_index.json deleted** | Memory page shows empty state, server doesn't crash, index rebuilt on next agent write | Delete file, verify UI shows "No memories" not an error |
| **.agent-studio.json deleted** | Server uses defaults, settings page shows blank config, user can re-configure | Delete file, verify server starts, verify settings page works |
| **Room JSON corrupted** | Room shows error state, other rooms unaffected | Corrupt one room file, verify other rooms work, verify error displayed |
| **Disk full during atomic write** | Temp file fails, original file untouched, error logged | Mock disk full on rename(), verify original file intact |
| **Agent .md file with no frontmatter** | Agent discovered but with default values, no crash | Create .md with no YAML, verify agent appears with "unknown" description |
| **chokidar watcher dies** | Watcher re-established on next poll, or server detects and restarts it | Kill watcher, verify it recovers |

### Network chaos

| Scenario | Expected behavior | Test |
|----------|------------------|------|
| **WebSocket flood** (1000 msgs/sec) | Rate limited, no crash, no memory spike | Send 1000 messages, verify server stable, verify rate limit applies |
| **Slow client** (100ms per read) | Server doesn't block on slow client, other clients get messages normally | Create slow mock client, verify other clients unaffected |
| **Client sends invalid JSON** | Connection stays open, error logged, no crash | Send garbage via WebSocket, verify server logs error, connection stays |
| **100 simultaneous connections** | All connect, all receive broadcasts, server stable | Create 100 clients, send broadcast, verify all receive |

### Electron chaos

| Scenario | Expected behavior | Test |
|----------|------------------|------|
| **Main window closed while server runs** | Server killed gracefully, no orphan processes | Close window, verify server PID is gone |
| **App force-quit** | Server process killed via will-quit handler | Force quit app, verify no orphaned server process |
| **Multiple app instances** | Second instance detects first, focuses existing window | Launch twice, verify only one runs |
| **Electron update mid-session** | Sessions preserved, server restarts cleanly | Simulate update, verify sessions resume |

**Run**: Weekly scheduled job. ~5 minute run time.

---

## Layer 6: User Journey Tests (E2E)

**What**: Full end-to-end tests using Playwright. Real Electron app, real server, real UI. Simulates a user doing real things.

**Framework**: Playwright (installed as a skill) + Electron testing.

**Setup**: Launch Agent Studio Electron app with `--remote-debugging-port=9222`. Playwright connects via CDP. Tests run against the real app with a mock `.agent-studio.json` pointing to test fixtures.

### Journey 1: First Launch
```
1. App launches → splash screen visible
2. Splash disappears → main window visible within 5s
3. Sessions page is default → empty state shown ("No active sessions")
4. Sidebar shows REPOS section with configured projects
5. Sidebar shows SERVERS section with configured dev servers
6. Top bar shows 0 active sessions, CPU/RAM stats
```

### Journey 2: Launch and Use a Session
```
1. Click [+ New Session] → launcher slides in
2. Select "Quick Chat" preset → form fills with sonnet, no agent, bypass
3. Click Launch → session appears in sidebar with "starting" status
4. Session becomes "active" → terminal shows Claude Code prompt
5. Type "hello" → text appears immediately (no lag >50ms)
6. Press Enter → Claude responds
7. Scroll up → previous conversation visible
8. Click [+ New Session] → launch second session
9. Click first session in sidebar → terminal switches instantly (no black screen)
10. Previous conversation still visible with scroll position preserved
11. Click second session → switches back
12. Close first session → sidebar updates, no crash
```

### Journey 3: Git Operations
```
1. Click a repo in sidebar → Git view replaces terminal
2. Recent commits visible
3. Changed files listed with M/A/D indicators
4. Click [Create PR] → PR form opens
5. Fill title, description → click Create → PR created (or mock confirms)
6. Click session in sidebar → back to terminal
```

### Journey 4: Dev Server Management
```
1. Server shows "stopped" in sidebar
2. Click [Start] → server process launches, status becomes "running"
3. Port shows green dot
4. Click [Open] → browser opens localhost:PORT
5. Click [Stop] → server killed, status becomes "stopped", port freed
6. Start server on occupied port → shows "Port in use" message with kill option
```

### Journey 5: Room Conversation
```
1. Navigate to Rooms page
2. Click [+ New Room] → form opens
3. Name room, select orchestrator + backend + frontend agents
4. Click Create → room appears in list
5. Click [Spawn Agents] → agents spawn, status shows "idle"
6. Type "@orchestrator what's the plan?" → message appears in chat
7. Typing indicator shows "orchestrator is working... (Xs)"
8. After agent finishes → one clean message appears (no thinking, no tool calls)
9. If orchestrator mentions @backend → backend typing indicator shows → backend responds
10. Messages are short, conversational, readable
11. Type a message → all pending agent work pauses → your message gets priority
12. Agent asks for help (@vatsal) → notification toast appears + badge on nav
```

### Journey 6: Sprint Lifecycle
```
1. Navigate to Sprints page
2. Planned sprints visible from ready.md / archive
3. Click [+ New Sprint] → creation form
4. Fill sprint details → click Create → appears in Planned
5. Click [Launch Sprint] → status moves to IN_PROGRESS
6. Gate 1 shows agents working
7. Gate 1 requirements complete → notification: "Gate 1 ready for approval"
8. Click [Approve Gate 1] → Gate 1 marked PASSED, Gate 2 starts
9. Eventually Gate 3 passes → sprint marked COMPLETED
10. Sprint moves to Completed section
11. Click completed sprint → archived details visible (spec, QA report, logs)
```

### Journey 7: Memory Browser
```
1. Navigate to Memory page
2. All 112 entries listed (from test fixtures)
3. Type "auth" in search → filtered to auth-related memories
4. Click "Learnings" category → filtered further
5. Click a memory → detail panel shows observation/action/outcome/lesson
6. Click [Pin] → memory moves to top of list
7. Toggle "Pinned only" → shows only pinned memories
8. Click [Edit] → form opens with current content → save → updated
9. Click [Delete] → confirmation dialog → confirm → memory removed
```

### Journey 8: Settings
```
1. Navigate to Settings page
2. Change default model from sonnet to opus → saved immediately
3. Add a new project → project appears in list and in sidebar REPOS
4. Toggle isProd on a project → PROD badge appears
5. View agents list → all discovered agents shown with descriptions
6. Configure dev server → appears in sidebar SERVERS section
7. Navigate to Shortcuts tab → all shortcuts listed
```

### Journey 9: Crash Recovery
```
1. Have 2 active sessions running
2. Kill the server process externally
3. Electron detects crash → shows reconnecting banner
4. Server auto-restarts
5. WebSocket reconnects
6. Sessions page shows sessions (even if PTY died, it shows "exited")
7. Can launch new sessions immediately
```

### Journey 10: Notifications
```
1. Be on Sessions page
2. An agent in a room mentions @vatsal
3. Toast notification appears in top-right
4. Badge appears on Rooms nav icon
5. Click toast → navigates to Rooms page, correct room selected
6. macOS notification also appeared (verify in notification center)
```

**Run**: On every PR. ~3 minute run time target (parallelized).

---

## Layer 7: Smoke Tests

**What**: The absolute minimum that must pass before any build ships. Run in 30 seconds. If this fails, nothing else matters.

**Framework**: Shell script + curl + basic assertions.

```bash
#!/bin/bash
# smoke-test.sh — Run after every build

set -e

PORT=9876
echo "Starting server..."
PORT=$PORT tsx server/index.ts &
SERVER_PID=$!
sleep 3

# 1. Server is alive
curl -sf http://127.0.0.1:$PORT/api/config > /dev/null
echo "✓ Server responds"

# 2. Config endpoint returns valid JSON
CONFIG=$(curl -sf http://127.0.0.1:$PORT/api/config)
echo "$CONFIG" | jq . > /dev/null
echo "✓ Config is valid JSON"

# 3. Agents endpoint works
curl -sf http://127.0.0.1:$PORT/api/agents > /dev/null
echo "✓ Agents endpoint responds"

# 4. Sessions endpoint works
curl -sf http://127.0.0.1:$PORT/api/sessions > /dev/null
echo "✓ Sessions endpoint responds"

# 5. Memory endpoint works
curl -sf http://127.0.0.1:$PORT/api/memory/entries > /dev/null
echo "✓ Memory endpoint responds"

# 6. WebSocket connects
node -e "
const ws = new (require('ws'))('ws://127.0.0.1:$PORT');
ws.on('open', () => { console.log('✓ WebSocket connects'); ws.close(); process.exit(0); });
ws.on('error', () => { console.log('✗ WebSocket failed'); process.exit(1); });
setTimeout(() => { console.log('✗ WebSocket timeout'); process.exit(1); }, 5000);
"

# 7. TypeScript compiles
npx tsc --noEmit
echo "✓ TypeScript compiles"

# 8. Next.js builds
npx next build
echo "✓ Next.js builds"

# Cleanup
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
echo ""
echo "All smoke tests passed."
```

**Run**: On every commit (pre-push hook). Must pass in <30 seconds.

---

## Testing Infrastructure

### CI Pipeline (GitHub Actions)

```yaml
# On every PR:
jobs:
  smoke:        # 30s — server starts, endpoints respond, TypeScript compiles
  unit:         # 10s — all pure function tests
  component:    # 15s — React component rendering
  integration:  # 30s — API + WebSocket + filesystem
  performance:  # 60s — latency thresholds, memory leak checks
  e2e:          # 180s — Playwright user journeys (parallelized)

# Weekly:
  chaos:        # 300s — process kills, file corruption, network floods
```

### Local Development

```bash
# While coding (watch mode)
npm run test:watch          # Layer 1: Unit tests, re-run on save

# Before committing
npm run test:smoke          # Layer 7: 30-second sanity check

# Before PR
npm run test:all            # Layers 1-4 + 6: Full suite except chaos

# Manual deep validation
npm run test:chaos          # Layer 5: Break things on purpose
npm run test:e2e            # Layer 6: Full Playwright journeys
```

### Test Fixtures

```
test/
  fixtures/
    agent-studio.json       # Valid config with 3 projects, 3 servers
    agents/                 # Mock .claude/agents/ with 4 agent .md files
    memory/
      memory_index.json     # 20 entries across all categories
      learnings/            # 5 mock memory files
      corrections/          # 3 mock memory files
      decisions/            # 3 mock memory files
    sprints/
      current.md            # Active sprint with 3 gates
      state.json            # In-progress state (gate 1 passed)
      ready.md              # PMO readiness scan
      handoffs/
        backend_to_frontend.json
        qa_report.json
      archive/
        2026-03-15_test_sprint.md
    rooms/
      room-1.json           # Room with 10 messages
      room-2.json           # Empty room (just created)
```

Every test suite copies these fixtures to a temp directory before running. Tests never modify the originals.

---

## What Gets Tested Before Each Feature Ships

### Before a Session feature ships:
- [ ] Unit: buffer management (circular buffer write/read/wraparound)
- [ ] Unit: session card state computation (all statuses, context %)
- [ ] Component: SessionCard renders all states
- [ ] Component: SessionLauncher presets fill correctly
- [ ] Component: TerminalPane mounts/unmounts without leak
- [ ] Integration: POST /api/sessions creates session
- [ ] Integration: DELETE /api/sessions/:id kills cleanly
- [ ] Integration: GET /api/sessions/:id/buffer returns correct data
- [ ] Integration: WebSocket terminal-data flow (input → output)
- [ ] Performance: typing latency <50ms
- [ ] Performance: session switch <100ms
- [ ] Performance: 6 sessions in memory <300MB total
- [ ] Chaos: PTY process killed externally → session shows exited
- [ ] Chaos: server crash → sessions recover or show exited
- [ ] E2E: Journey 2 (launch, type, scroll, switch, close)
- [ ] Smoke: server starts, sessions endpoint responds

### Before a Room feature ships:
- [ ] Unit: mention parser (@agent, @all, @human, no mention)
- [ ] Unit: SDK message filter (drop thinking/tools, emit turn_end)
- [ ] Unit: conversation protocol (turn-taking, depth limit, no self-loop)
- [ ] Component: RoomChat renders messages as markdown
- [ ] Component: ChatMessage shows agent name/avatar/timestamp
- [ ] Component: typing indicator shows/hides correctly
- [ ] Component: approval buttons render for approval-request type
- [ ] Integration: POST /api/rooms/:id/messages routes correctly
- [ ] Integration: POST /api/rooms/:id/spawn creates SDK sessions
- [ ] Integration: WebSocket room-message flow
- [ ] Integration: notification emitted when agent mentions @human
- [ ] Performance: message delivery <200ms
- [ ] Chaos: SDK session hangs → 30s timeout → error shown
- [ ] Chaos: 100 messages rapid-fire → no crash, rate limited
- [ ] E2E: Journey 5 (create room, spawn, chat, turn-taking, notification)
- [ ] Smoke: rooms endpoint responds

### Before a Sprint feature ships:
- [ ] Unit: health score calculation
- [ ] Unit: sprint state parser (all gate combinations)
- [ ] Unit: gate transition logic (WAITING → IN_PROGRESS → PASSED)
- [ ] Component: SprintList renders active/completed/planned
- [ ] Component: SprintDetail shows gates/agents/handoffs/QA
- [ ] Component: GateCard renders all states with approve button
- [ ] Integration: GET /api/sprints returns from filesystem
- [ ] Integration: POST /api/sprints/:id/approve-gate advances state
- [ ] Integration: chokidar detects state.json change → WebSocket broadcast
- [ ] Integration: chokidar detects new handoff file → broadcast
- [ ] Performance: sprint state parse <50ms
- [ ] Chaos: state.json corrupted → server loads defaults
- [ ] Chaos: handoff file written during read → no corruption
- [ ] E2E: Journey 6 (view sprints, launch, gates, approve, complete)
- [ ] Smoke: sprints endpoint responds

### Before Memory feature ships:
- [ ] Unit: memory index search (by tag, by category, by text)
- [ ] Component: MemoryList search and filter
- [ ] Component: MemoryDetail renders structured content
- [ ] Integration: GET /api/memory/entries returns from index
- [ ] Integration: GET /api/memory/entry returns full file
- [ ] Integration: POST /api/memory/entries creates file + updates index
- [ ] Integration: path traversal blocked (../../ etc)
- [ ] Integration: chokidar detects new memory → UI updates
- [ ] Performance: 500 entries load <100ms
- [ ] Chaos: memory_index.json deleted → empty state, no crash
- [ ] E2E: Journey 7 (search, filter, view, pin, edit, delete)
- [ ] Smoke: memory endpoint responds

### Before Electron ships:
- [ ] Electron: cold start <5s
- [ ] Electron: server auto-restart on crash
- [ ] Electron: graceful shutdown (no orphan processes)
- [ ] Electron: native macOS notification fires
- [ ] Electron: dock badge updates
- [ ] Electron: window state persisted (size, position)
- [ ] Electron: second instance detection
- [ ] E2E: Journey 9 (crash recovery)
- [ ] E2E: Journey 10 (notifications)
- [ ] Smoke: Electron launches, main window visible

---

## How This Integrates with the Build Process

Every implementation phase from the design spec gets validated before moving to the next:

```
Phase 1: Server hardening
  → Must pass: All Layer 1 unit tests + Layer 3 integration tests + Layer 5 chaos tests for server
  → Gate: "Server doesn't crash under any tested condition"

Phase 2: Terminal sessions
  → Must pass: All session-related tests across all layers
  → Gate: "Sessions are fast, reliable, switchable, scrollable"

Phase 3: Rooms
  → Must pass: All room-related tests across all layers
  → Gate: "Rooms show clean conversations, notifications work"

Phase 4: Sprints
  → Must pass: All sprint-related tests across all layers
  → Gate: "Sprints track gates, approve works, maps to protocol"

Phase 5: Memory + Settings + Polish
  → Must pass: All remaining tests + full E2E suite
  → Gate: "Every journey passes, every smoke test passes"

Ship → All 7 layers green
```

No feature moves to the next phase until its tests are green. No exceptions.

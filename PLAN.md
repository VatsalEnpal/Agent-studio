# Agent Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost web app that manages multiple Claude Code sessions with live terminals, sprint lifecycle monitoring, and a session launcher — all in one browser tab.

**Architecture:** Next.js 16 app with a custom Node.js WebSocket server for terminal I/O. The server spawns Claude Code processes via node-pty, streams output to xterm.js in the browser, and watches ai-agents/ files for sprint/scan/memory data. Single multiplexed WebSocket connection.

**Tech Stack:** Next.js 16, React 19, @xterm/xterm 6.x, node-pty, ws, chokidar, react-resizable-panels, zustand, tailwindcss, radix-ui, lucide-react

---

## File Structure

```
agent-console/
├── package.json
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── server/
│   ├── index.ts                 # Custom server: Express + WebSocket + Next.js
│   ├── terminal-manager.ts      # Spawn/kill/list PTY sessions, HeadlessEmulator
│   ├── file-watcher.ts          # Watch ai-agents/ for sprint/scan/memory changes
│   ├── ws-handler.ts            # Multiplexed WebSocket: terminal I/O + file events
│   ├── process-discovery.ts     # Detect running Claude Code processes
│   └── types.ts                 # Shared server types
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout, providers, global styles
│   │   ├── page.tsx             # Main app (redirect to /sessions)
│   │   ├── sessions/
│   │   │   └── page.tsx         # Sessions mode (terminal grid)
│   │   └── teams/
│   │       └── page.tsx         # Teams mode (sprint lifecycle)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx      # Left sidebar: sessions list, folders, git, actions
│   │   │   ├── toggle-bar.tsx   # Top bar: Sessions/Teams/Memory/Settings + stats
│   │   │   └── bottom-bar.tsx   # Status bar: session counts, shortcuts
│   │   ├── terminal/
│   │   │   ├── terminal-pane.tsx # Single xterm.js instance with header/badges
│   │   │   ├── terminal-grid.tsx# Auto-layout grid of terminal panes
│   │   │   └── terminal-fullscreen.tsx # Fullscreen overlay for focused pane
│   │   ├── sessions/
│   │   │   ├── session-item.tsx # Sidebar session entry (dot, name, cost)
│   │   │   ├── session-launcher.tsx # + New modal with presets/options
│   │   │   └── session-group.tsx# Group header (Sprint Team / Standalone)
│   │   ├── teams/
│   │   │   ├── sprint-hero.tsx  # Sprint card with gates + phase bar
│   │   │   ├── agent-roster.tsx # List of agents with status + current task
│   │   │   ├── activity-feed.tsx# Real-time activity log
│   │   │   ├── handoff-card.tsx # Agent handoff display
│   │   │   ├── sprint-history.tsx # Past sprints list with QA scores
│   │   │   ├── scan-log.tsx     # PMO scan history
│   │   │   └── sprint-spec-viewer.tsx # Expandable markdown spec
│   │   └── ui/                  # Shared primitives (button, badge, tooltip, dialog)
│   ├── hooks/
│   │   ├── use-websocket.ts     # WebSocket connection + reconnect logic
│   │   ├── use-sessions.ts      # Session state from WebSocket
│   │   ├── use-sprint.ts        # Sprint data from file watcher
│   │   └── use-keyboard.ts      # Global keyboard shortcuts
│   ├── stores/
│   │   ├── sessions.ts          # zustand: session list, focused, grid layout
│   │   ├── sprint.ts            # zustand: current sprint, gates, activity
│   │   └── ui.ts                # zustand: sidebar open, active mode, fullscreen
│   ├── lib/
│   │   ├── ws-client.ts         # Client-side WebSocket with multiplexing
│   │   ├── types.ts             # Shared client types
│   │   └── utils.ts             # Helpers
│   └── styles/
│       └── globals.css          # Tailwind + custom terminal styles
├── public/
│   ├── favicon-green.svg
│   ├── favicon-yellow.svg
│   └── favicon-red.svg
└── tests/
    ├── terminal-manager.test.ts
    ├── file-watcher.test.ts
    └── process-discovery.test.ts
```

---

## Phase 1: Server Foundation + One Terminal

Working result: open localhost:8080, see one Claude Code terminal in the browser, type in it.

### Task 1: Project Scaffold

**Files:**
- Create: `agent-console/package.json`
- Create: `agent-console/tsconfig.json`
- Create: `agent-console/next.config.mjs`
- Create: `agent-console/tailwind.config.ts`
- Create: `agent-console/postcss.config.mjs`
- Create: `agent-console/src/styles/globals.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "agent-studio",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server/index.ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.2.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "@xterm/xterm": "^6.1.0",
    "@xterm/addon-fit": "^0.12.0",
    "@xterm/addon-webgl": "^0.20.0",
    "node-pty": "^1.1.0",
    "ws": "^8.18.0",
    "express": "^5.1.0",
    "chokidar": "^4.0.0",
    "react-resizable-panels": "^3.0.0",
    "zustand": "^5.0.0",
    "lucide-react": "^0.577.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "tailwindcss": "^3.4.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/express": "^5",
    "@types/ws": "^8",
    "tsx": "^4.19.0",
    "typescript": "^5",
    "vitest": "^4.1.0",
    "postcss": "^8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.mjs**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}
export default nextConfig
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        console: {
          bg: '#0a0a0a',
          panel: '#111111',
          border: '#1a1a1a',
          accent: '#f59e0b',
          success: '#4ade80',
          error: '#ef4444',
          text: '#cccccc',
          muted: '#888888',
          dim: '#555555',
          faint: '#333333',
        }
      }
    }
  },
  plugins: [],
}
export default config
```

- [ ] **Step 5: Create postcss.config.mjs + globals.css**

postcss.config.mjs:
```javascript
const config = { plugins: { tailwindcss: {} } }
export default config
```

globals.css:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { background: #0a0a0a; color: #ccc; }
```

- [ ] **Step 6: Install dependencies**

Run: `cd agent-console && npm install`
Expected: node_modules created, 0 vulnerabilities

- [ ] **Step 7: Commit**

```bash
git add agent-console/
git commit -m "feat(agent-console): scaffold project — next.js 16, xterm, node-pty, tailwind"
```

---

### Task 2: Custom Server with PTY

**Files:**
- Create: `agent-console/server/types.ts`
- Create: `agent-console/server/terminal-manager.ts`
- Create: `agent-console/server/index.ts`

- [ ] **Step 1: Create server types**

```typescript
// server/types.ts
export interface Session {
  id: string
  name: string
  pid: number
  command: string
  args: string[]
  cwd: string
  status: 'starting' | 'active' | 'idle' | 'exited'
  exitCode?: number
  createdAt: number
}

export interface WsMessage {
  type: 'terminal-data' | 'terminal-resize' | 'terminal-input' | 'sessions-update' | 'file-update'
  sessionId?: string
  data?: string
  cols?: number
  rows?: number
  payload?: unknown
}
```

- [ ] **Step 2: Create terminal manager**

```typescript
// server/terminal-manager.ts
import * as pty from 'node-pty'
import type { Session } from './types'

export class TerminalManager {
  private sessions = new Map<string, { session: Session; ptyProcess: pty.IPty }>()
  private listeners = new Set<(event: string, data: unknown) => void>()

  createSession(opts: {
    name: string
    command: string
    args: string[]
    cwd: string
    cols?: number
    rows?: number
  }): Session {
    const id = crypto.randomUUID()
    const ptyProcess = pty.spawn(opts.command, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 120,
      rows: opts.rows ?? 30,
      cwd: opts.cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    })

    const session: Session = {
      id,
      name: opts.name,
      pid: ptyProcess.pid,
      command: opts.command,
      args: opts.args,
      cwd: opts.cwd,
      status: 'active',
      createdAt: Date.now(),
    }

    ptyProcess.onData((data) => {
      this.emit('terminal-data', { sessionId: id, data })
    })

    ptyProcess.onExit(({ exitCode }) => {
      session.status = 'exited'
      session.exitCode = exitCode
      this.emit('sessions-update', { sessions: this.listSessions() })
    })

    this.sessions.set(id, { session, ptyProcess })
    this.emit('sessions-update', { sessions: this.listSessions() })
    return session
  }

  writeToSession(id: string, data: string): void {
    this.sessions.get(id)?.ptyProcess.write(data)
  }

  resizeSession(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.ptyProcess.resize(cols, rows)
  }

  killSession(id: string): void {
    const entry = this.sessions.get(id)
    if (entry) {
      entry.ptyProcess.kill()
      this.sessions.delete(id)
      this.emit('sessions-update', { sessions: this.listSessions() })
    }
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).map(e => e.session)
  }

  onEvent(listener: (event: string, data: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: string, data: unknown): void {
    for (const listener of this.listeners) listener(event, data)
  }
}
```

- [ ] **Step 3: Create the custom server**

```typescript
// server/index.ts
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import next from 'next'
import { TerminalManager } from './terminal-manager'
import type { WsMessage } from './types'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '8080')
const app = next({ dev })
const handle = app.getRequestHandler()

const terminalManager = new TerminalManager()

app.prepare().then(() => {
  const server = express()
  const httpServer = createServer(server)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (ws: WebSocket) => {
    // Send current sessions on connect
    ws.send(JSON.stringify({
      type: 'sessions-update',
      payload: { sessions: terminalManager.listSessions() }
    }))

    // Listen for terminal events and forward to this client
    const unsubscribe = terminalManager.onEvent((event, data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: event, ...(data as object) }))
      }
    })

    ws.on('message', (raw) => {
      const msg: WsMessage = JSON.parse(raw.toString())

      switch (msg.type) {
        case 'terminal-input':
          if (msg.sessionId && msg.data) {
            terminalManager.writeToSession(msg.sessionId, msg.data)
          }
          break
        case 'terminal-resize':
          if (msg.sessionId && msg.cols && msg.rows) {
            terminalManager.resizeSession(msg.sessionId, msg.cols, msg.rows)
          }
          break
      }
    })

    ws.on('close', unsubscribe)
  })

  // API: create session
  server.use(express.json())
  server.post('/api/sessions', (req, res) => {
    const { name, command, args, cwd, cols, rows } = req.body
    const session = terminalManager.createSession({
      name: name || 'claude',
      command: command || 'claude',
      args: args || ['--dangerously-skip-permissions'],
      cwd: cwd || process.env.HOME || '/tmp',
      cols, rows,
    })
    res.json(session)
  })

  // API: kill session
  server.delete('/api/sessions/:id', (req, res) => {
    terminalManager.killSession(req.params.id)
    res.json({ ok: true })
  })

  // API: list sessions
  server.get('/api/sessions', (_req, res) => {
    res.json(terminalManager.listSessions())
  })

  // Next.js handles everything else
  server.all('*', (req, res) => handle(req, res))

  httpServer.listen(port, '127.0.0.1', () => {
    console.log(`\n  Agent Studio running on http://localhost:${port}\n`)
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add agent-console/server/
git commit -m "feat(agent-console): custom server with PTY terminal manager + WebSocket"
```

---

### Task 3: Terminal Component (xterm.js in browser)

**Files:**
- Create: `agent-console/src/hooks/use-websocket.ts`
- Create: `agent-console/src/lib/ws-client.ts`
- Create: `agent-console/src/components/terminal/terminal-pane.tsx`
- Create: `agent-console/src/app/layout.tsx`
- Create: `agent-console/src/app/page.tsx`

- [ ] **Step 1: Create WebSocket client**

```typescript
// src/lib/ws-client.ts
type MessageHandler = (msg: any) => void

class WsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler>>()
  private reconnectTimer: NodeJS.Timeout | null = null

  connect(url: string) {
    this.ws = new WebSocket(url)

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      const handlers = this.handlers.get(msg.type)
      if (handlers) {
        for (const handler of handlers) handler(msg)
      }
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(url), 2000)
    }
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler)
    return () => this.handlers.get(type)?.delete(handler)
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}

export const wsClient = new WsClient()
```

- [ ] **Step 2: Create terminal pane component**

```typescript
// src/components/terminal/terminal-pane.tsx
'use client'

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { wsClient } from '@/lib/ws-client'

interface TerminalPaneProps {
  sessionId: string
  name: string
  focused?: boolean
  onFocus?: () => void
}

export function TerminalPane({ sessionId, name, focused, onFocus }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Consolas, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#cccccc',
        cursor: '#4ade80',
        selectionBackground: '#333333',
      },
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // WebGL not available, fallback to canvas
    }

    fitAddon.fit()
    termRef.current = term
    fitRef.current = fitAddon

    // Send input to server
    term.onData((data) => {
      wsClient.send({ type: 'terminal-input', sessionId, data })
    })

    // Receive output from server
    const unsubscribe = wsClient.on('terminal-data', (msg: any) => {
      if (msg.sessionId === sessionId) {
        term.write(msg.data)
      }
    })

    // Handle resize
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      wsClient.send({
        type: 'terminal-resize',
        sessionId,
        cols: term.cols,
        rows: term.rows,
      })
    })
    observer.observe(containerRef.current)

    return () => {
      unsubscribe()
      observer.disconnect()
      term.dispose()
    }
  }, [sessionId])

  return (
    <div
      className={`flex flex-col h-full bg-console-bg rounded ${focused ? 'ring-1 ring-console-success' : ''}`}
      onClick={onFocus}
    >
      <div className="flex items-center justify-between px-2 py-1 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-console-success" />
          <span className="text-console-text">{name}</span>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 px-1" />
    </div>
  )
}
```

- [ ] **Step 3: Create layout + page**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Agent Studio',
  description: 'Command center for Claude Code agents',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-console-bg text-console-text font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
```

```typescript
// src/app/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { wsClient } from '@/lib/ws-client'
import { TerminalPane } from '@/components/terminal/terminal-pane'

export default function Home() {
  const [sessions, setSessions] = useState<any[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    wsClient.connect(`ws://localhost:8080/ws`)
    wsClient.on('sessions-update', (msg: any) => setSessions(msg.payload?.sessions || msg.sessions || []))
    setReady(true)
    return () => wsClient.disconnect()
  }, [])

  async function createSession() {
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'claude',
        command: 'claude',
        args: ['--dangerously-skip-permissions'],
        cwd: process.env.HOME || '/Users/vatsalbhatt230813/Code/InPipeline',
      }),
    })
  }

  if (!ready) return <div className="flex items-center justify-center h-screen text-console-dim">Starting...</div>

  return (
    <div className="h-screen flex flex-col">
      <div className="p-2 border-b border-console-border flex items-center gap-4">
        <span className="text-console-accent font-semibold text-sm">Agent Studio</span>
        <button onClick={createSession} className="text-xs text-console-dim hover:text-console-accent px-2 py-1 border border-console-border rounded">
          + New Session
        </button>
        <span className="text-[10px] text-console-dim">{sessions.length} sessions</span>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-[1px] bg-console-border p-[1px]">
        {sessions.map((s) => (
          <TerminalPane key={s.id} sessionId={s.id} name={s.name} />
        ))}
        {sessions.length === 0 && (
          <div className="col-span-2 flex items-center justify-center text-console-dim">
            <div className="text-center">
              <div className="text-lg mb-2">No sessions running</div>
              <button onClick={createSession} className="text-console-accent hover:underline">
                Start your first session →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Test it**

Run: `cd agent-console && npm run dev`
Open: `http://localhost:8080`
Click: "+ New Session"
Expected: Claude Code terminal appears in the browser. You can type in it.

- [ ] **Step 5: Commit**

```bash
git add agent-console/src/
git commit -m "feat(agent-console): terminal pane with xterm.js + WebSocket — first working terminal"
```

---

## Phase 2: Multi-Session + Sidebar + Grid

Working result: multiple terminals in a grid, sidebar showing sessions, click to focus, kill sessions.

### Task 4: Zustand Store for Sessions

**Files:**
- Create: `agent-console/src/stores/sessions.ts`
- Create: `agent-console/src/stores/ui.ts`
- Create: `agent-console/src/lib/types.ts`

(Detailed implementation with session state, focused pane tracking, grid layout calculation)

### Task 5: Sidebar Component

**Files:**
- Create: `agent-console/src/components/layout/sidebar.tsx`
- Create: `agent-console/src/components/sessions/session-item.tsx`
- Create: `agent-console/src/components/sessions/session-group.tsx`

### Task 6: Terminal Grid with Auto-Layout

**Files:**
- Create: `agent-console/src/components/terminal/terminal-grid.tsx`
- Modify: `agent-console/src/app/page.tsx`

(Grid calculates layout: 1→full, 2→split, 3→L-shape, 4→2x2, 5-6→2x3. Max 6 visible.)

### Task 7: Session Launcher Modal

**Files:**
- Create: `agent-console/src/components/sessions/session-launcher.tsx`

(Modal with presets, model/agent/permissions/channel/directory pickers)

---

## Phase 3: Teams Mode (Sprint Lifecycle)

Working result: toggle to Teams view, see sprint status, gates, agent roster, activity log.

### Task 8: File Watcher Server

**Files:**
- Create: `agent-console/server/file-watcher.ts`
- Modify: `agent-console/server/index.ts`

(Watches ai-agents/sprints/, ai-agents/tools/memory_index.json, .claude/agents/. Pushes updates via WebSocket.)

### Task 9: Toggle Bar

**Files:**
- Create: `agent-console/src/components/layout/toggle-bar.tsx`
- Create: `agent-console/src/app/sessions/page.tsx`
- Create: `agent-console/src/app/teams/page.tsx`

### Task 10: Sprint Hero + Gates + Phase Bar

**Files:**
- Create: `agent-console/src/components/teams/sprint-hero.tsx`
- Create: `agent-console/src/stores/sprint.ts`

### Task 11: Agent Roster + Activity Feed

**Files:**
- Create: `agent-console/src/components/teams/agent-roster.tsx`
- Create: `agent-console/src/components/teams/activity-feed.tsx`

### Task 12: Handoffs + Scan Log + Sprint History

**Files:**
- Create: `agent-console/src/components/teams/handoff-card.tsx`
- Create: `agent-console/src/components/teams/scan-log.tsx`
- Create: `agent-console/src/components/teams/sprint-history.tsx`

---

## Phase 4: Polish + Keyboard + Notifications

### Task 13: Keyboard Shortcuts

**Files:**
- Create: `agent-console/src/hooks/use-keyboard.ts`

(⌘N, ⌘1-6, ⌘K, ⌘Enter, Esc, ⌘\, ⌘F, Tab)

### Task 14: Terminal Fullscreen Mode

**Files:**
- Create: `agent-console/src/components/terminal/terminal-fullscreen.tsx`

### Task 15: Bottom Status Bar

**Files:**
- Create: `agent-console/src/components/layout/bottom-bar.tsx`

### Task 16: Favicon + Tab Title + Notifications

**Files:**
- Modify: `agent-console/src/app/layout.tsx`
- Create: `agent-console/src/hooks/use-notifications.ts`

(Dynamic favicon: green/yellow/red. Tab title: "(3) Agent Studio". Toast notifications for gate pass, errors.)

### Task 17: Command Palette (⌘K)

**Files:**
- Create: `agent-console/src/components/layout/command-palette.tsx`

(Spotlight-style search across sessions, memory, sprints, actions)

---

## Phase 5: Git + Folders + PR

### Task 18: Folder Browser in Sidebar

**Files:**
- Modify: `agent-console/src/components/layout/sidebar.tsx`

(Clickable folders: open in Finder or Cursor)

### Task 19: Git Status + Branch Display

**Files:**
- Create: `agent-console/server/git-status.ts`

(Poll git status per worktree every 10s. Show branch + dirty/clean badge.)

### Task 20: Create PR Action

**Files:**
- Create: `agent-console/server/pr-creator.ts`

(Uses Azure DevOps API via git credentials. Modal: select branch, title, confirm.)

---

## Execution Summary

| Phase | Tasks | What you get |
|-------|-------|-------------|
| 1 | 1-3 | One working terminal in browser. Type in it. |
| 2 | 4-7 | Multiple sessions, sidebar, grid, launcher |
| 3 | 8-12 | Teams mode with sprint lifecycle |
| 4 | 13-17 | Keyboard shortcuts, fullscreen, notifications, ⌘K |
| 5 | 18-20 | Git integration, folders, PR creation |

Each phase produces working software. Ship after Phase 2 for a useful MVP.

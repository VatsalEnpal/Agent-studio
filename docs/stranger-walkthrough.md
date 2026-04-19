# Stranger Walkthrough — Fresh-User Smoke Test

This doc describes the experience a fresh developer should get when cloning Agent Studio
for the first time. Reviewers can use it to sanity-check a release candidate without
the full clone-to-/tmp-with-isolated-HOME ceremony.

**Target audience.** Developers. Not end users. Comfort with a terminal, `git`, `node`,
and having their own Claude Code CLI set up is assumed.

---

## 1. Clone & bootstrap

```bash
git clone https://github.com/VatsalEnpal/Agent-studio.git
cd Agent-studio
./install.sh
```

`install.sh` is idempotent. It:

- verifies Node 22+, npm, `git`, and `claude` CLI
- runs `npm ci`
- rebuilds `node-pty` for the current platform/Electron ABI
- exports `AGENT_STUDIO_DIR` in the user's shell profile
- warns if port 8080 is already in use

**Known rough edge.** If the user installed Claude Code via the native installer
(rather than the JS CLI via `npm i -g @anthropic-ai/claude-code`), the SDK rooms
path may resolve a different `claude` binary than the terminal sessions path.
Both should work, but cost tracking for SDK rooms depends on the JS CLI's
usage file format. If rooms show `$0.00` forever, install the JS CLI.

---

## 2. Start the app (three shapes)

Three supported runtime shapes:

| Shape            | Command                | Use when                                                             |
| ---------------- | ---------------------- | -------------------------------------------------------------------- |
| Dev server       | `npm run dev`          | Day-to-day hacking. Fast reload. Browser at `http://localhost:8080`. |
| Dev + Electron   | `npm run electron:dev` | Testing the desktop shell, tray, native notifications.               |
| Packaged Mac app | `npm run install:mac`  | Smoke-test a real `.app` install. Takes 5-10 min.                    |

For a stranger walkthrough against an isolated HOME so your real `~/.agent-studio`
state isn't touched:

```bash
HOME=/tmp/stranger-home PORT=8090 npm run dev
```

Then open `http://localhost:8090`.

---

## 3. Expected flow

1. **Setup wizard** appears on first load (no existing `.agent-studio.json`).
   - Describe the project in natural language.
   - Optionally point to a project folder.
   - Accept, edit, or skip the generated agent set.
   - Click **Set me up** (or **Skip setup** to go straight to the dashboard).
2. **Sessions tab** becomes the landing view.
   - Sidebar shows empty repo list, empty session list, discovered dev servers (if any).
3. **Launch a session** via `Cmd+Shift+N`.
   - Pick a preset (Quick Chat / Start Sprint / etc.) or customize the model + agent.
   - The session appears in the grid and streams from the real Claude Code CLI.
4. **Create a room** in the Teams tab.
   - Pick agents, name the room, send a message, watch streamed SDK replies.
5. **Create a sprint** in the Sprints tab.
   - Pick a workflow, define the goal, watch step-by-step progress with gates.

If any of those five steps fails for a brand-new clone on a supported machine,
that's a release blocker.

---

## 4. Unsigned DMG posture

Packaged builds (`npm run build:mac` / `npm run install:mac`) produce an unsigned,
unnotarized `.dmg` and `.app`. This is intentional for the current developer-focused
distribution. On first launch:

> Right-click the app in `/Applications` and choose **Open**. You'll get a
> Gatekeeper prompt that you won't get on subsequent launches. Alternatively,
> run `xattr -dr com.apple.quarantine '/Applications/Agent Studio.app'`.

This posture is fine for the target audience (engineers who understand what
"unnotarized" means). Notarization is a v1.0 item.

---

## 5. Permission modes for autonomous runs

When driving Agent Studio with `claude` from the terminal against itself:

- **Preferred:** `--permission-mode auto` (aliased as `npm run claude:auto`).
  The classifier blocks destructive actions and scope-creep without prompting,
  but doesn't blanket-allow everything.
- **Avoid:** `--dangerously-skip-permissions`. Skips _all_ safety checks.
  Use only for tightly-scoped throwaway experiments.

---

## 6. Things to spot-check manually

- **Desktop notifications on macOS.** Requires TCC grant. First launch of the
  packaged app triggers the prompt; the dev server inherits Terminal's TCC
  grant. Test with:
  ```bash
  curl -XPOST http://localhost:8080/api/test/notify \
    -H 'Content-Type: application/json' \
    -d '{"title":"Hello","message":"Testing"}'
  ```
  The `/api/test/notify` endpoint is dev-only (`NODE_ENV !== "production"`).
- **Agent discovery precedence.** Place an agent named `foo` in both
  `~/.claude/agents/foo.md` (global) and `<project>/.claude/agents/foo.md`
  (project). With the project active, the project version should win.
- **Single-server discipline.** Launching a second `npm run dev` while one
  is on :8080 should be blocked by the pre-bash-safety hook, not silently
  succeed on a different port.

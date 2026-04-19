# Changelog

All notable changes to Agent Studio are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.6.0] — 2026-04-18

### Added

- Scoped agent discovery: agents in `~/.claude/agents/` (global) and `<project>/.claude/agents/` (project-scoped) are auto-discovered and tagged with scope.
- Settings → Agents now has a dedicated "Sources" section for adding and removing custom agent folders with Global or project-specific scope.
- Create Agent dialog lets you author a new `.md` agent file directly from the UI.
- Browse Templates modal imports selected agent templates one at a time with a chosen destination folder.
- Sprint step cards render status badges plus Approve / Pause / Resume / Cancel controls wired to the existing gate routes.
- Per-step gate configuration: choose Auto, Approve-before-start, or Approve-before-finish on every sprint step.
- Sprints survive server restart — a paused sprint now resumes from its last handoff output.
- Inline `@agent-name` routing in rooms: mentioning an agent in a message skips the orchestrator and goes straight to that agent.
- Approval-request cards in rooms render inline Approve and Reject buttons.
- Empty-state for rooms with a "Create your first room" CTA.
- Sprint handoff contract documented at `docs/sprint-handoff.md`.
- Stranger walkthrough doc at `docs/stranger-walkthrough.md` for first-time users.
- Dev-only Mac notifications endpoint for sanity-checking `node-notifier` integration.
- Docker image now ships with a `tini` entrypoint and declares `EXPOSE` + `VOLUME` for cleaner container runs.

### Changed

- Agent dropdowns in session, room, and sprint UIs filter by the active project's scope and display a `●` (Global) or `◆` (Project) badge.
- WebSocket broadcasts are now topic-routed (`room:<id>`, `sprint:<id>`, `terminal:<id>`, `global`) instead of fanning out to every connected client.
- Git status, process discovery, and startup branch lookup use async `exec` with TTL caches, so slow filesystem calls no longer block the event loop.
- Polling loops (git-status, automations, workflow scheduler) are unified under `server/services/poller.ts` with an observable `/api/debug/poller-stats` endpoint.
- Setup wizard captures "Where are your agents?" as a dedicated step with an "Add another folder" action.
- Session launcher refetches its agent list every time it opens — newly created agents appear without a page reload.
- Sprint execution engine writes per-step handoff input and output JSON to `<agentSystemBase>/sprints/handoffs/`.
- Agent SDK room runs now resolve the `claude-code` CLI explicitly so rooms work on machines where the SDK cannot auto-detect it.
- `package.json` engines field pinned to `>=22.0.0`.

### Fixed

- PTY close now verifies the kill with `process.kill(pid, 0)` and logs `PTY_KILL_FAILED` if a process refuses to die.
- Sprint state syncs reliably between executor and persisted JSON; combined `<sprintId>-run-<runId>` ids returned from `GET /api/sprints` are accepted on all action routes.
- Session launcher dropdown is no longer rendered from a stale `session-launcher.tsx` file — `session-launcher-v2.tsx` is the single source of truth.
- Stuck "agent is thinking" indicator clears when the agent reports idle after an error.

### Removed

- Hardcoded 7-agent fallback (`orchestrator / frontend / backend / qa / security / pmo / documentation`). Users now create or import agents explicitly; the launcher surfaces an empty state when no agents are configured.
- README "Quick Import" line that documented a feature which never shipped.

---

## [0.5.0] — 2026-03 (pre-Keep-a-Changelog)

See git history before tag `v0.6.0` for v0.5.0 and earlier changes.

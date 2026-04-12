# Sprint Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace confusing horizontal gate stepper with vertical gate list, inline expansion, pause/resume controls, and runtime stats.

**Architecture:** Rewrite `sprint-detail.tsx` layout. Kill `gate-stepper.tsx`. Add pause/resume API endpoints. Reuse existing `ActivityLog` component for logs panel.

**Tech Stack:** React 19, Tailwind CSS, Express 5

---

### Task 1: Vertical gate list with inline expansion

**Files:**
- Modify: `src/components/sprints/sprint-detail.tsx` (main layout rewrite)
- Delete: `src/components/sprints/gate-stepper.tsx` (horizontal stepper)

- [ ] **Step 1: Remove GateStepper import and usage**

In `sprint-detail.tsx`, remove:
```typescript
// Remove import
import { GateStepper } from "./gate-stepper";

// Remove usage (lines 297-309) — the entire gate stepper block in the header
```

- [ ] **Step 2: Replace Overview tab content with vertical gate list**

Replace the Overview tab content (lines 420-533) with a single vertical gate list that has inline expansion:

```tsx
{activeTab === "overview" ? (
  <div className="flex-1 overflow-y-auto scrollbar-thin">
    {/* Vertical gate list — THE main content */}
    <div className="divide-y divide-border-default">
      {sprint.gates.map((gate) => {
        const isPassed = gate.status === "passed";
        const isCurrent = gate.status === "in_progress";
        const isFailed = gate.status === "failed";
        const isExpanded = expandedGateId === gate.id;

        return (
          <div key={gate.id}>
            {/* Gate row */}
            <button
              onClick={() => setExpandedGate(isExpanded ? null : gate.id)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-bg-elevated/50 transition-all"
            >
              {/* Status icon */}
              <div className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0",
                isPassed && "bg-sessions",
                isCurrent && "bg-sprints animate-pulse-dot",
                isFailed && "bg-error",
                !isPassed && !isCurrent && !isFailed && "bg-border-default",
              )} />

              {/* Gate name */}
              <span className={cn(
                "text-xs font-medium flex-1",
                isPassed ? "text-text-primary" : isCurrent ? "text-sprints" : "text-text-tertiary",
              )}>
                {gate.name}
              </span>

              {/* Status label */}
              <span className={cn(
                "text-2xs font-medium px-1.5 py-0.5 rounded-full",
                isPassed && "bg-sessions/10 text-sessions",
                isCurrent && "bg-sprints/10 text-sprints",
                isFailed && "bg-error/10 text-error",
                !isPassed && !isCurrent && !isFailed && "text-text-ghost",
              )}>
                {isPassed ? "Passed" : isCurrent ? "In Progress" : isFailed ? "Failed" : "Pending"}
              </span>

              {/* Expand chevron */}
              <ChevronRightIcon size={14} className={cn(
                "text-text-ghost transition-transform",
                isExpanded && "rotate-90",
              )} />
            </button>

            {/* Expanded details — inline below the gate */}
            {isExpanded && (
              <ExpandedGatePanel
                gate={gate}
                onClose={() => setExpandedGate(null)}
              />
            )}

            {/* Approve button for actionable gates */}
            {isCurrent && gate.requirements.length > 0 && gate.requirements.every(r => r.met) && (
              <div className="px-4 py-2 bg-sprints/5 flex items-center gap-2">
                <span className="text-xs text-sprints flex-1">{gate.name} ready for approval</span>
                <button
                  onClick={() => void handleApproveGate(gate.id)}
                  disabled={approvingGate === gate.id}
                  className="px-3 py-1 text-xs font-medium bg-sprints text-bg-base rounded-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {approvingGate === gate.id ? "Approving..." : "Approve"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* Footer: agents + runtime stats */}
    <div className="px-4 py-3 border-t border-border-default space-y-2">
      {/* Agents — single line */}
      {sprint.agents.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-text-ghost">
          <span className="font-medium text-text-tertiary">Agents:</span>
          <span>{sprint.agents.map(a => a.name).join(" · ")}</span>
        </div>
      )}

      {/* Runtime stats */}
      <div className="flex items-center gap-4 text-xs text-text-ghost">
        {sprint.startedAt && (
          <span>Started: {new Date(sprint.startedAt).toLocaleString()}</span>
        )}
        {sprint.completedAt && (
          <span>Completed: {new Date(sprint.completedAt).toLocaleString()}</span>
        )}
        <span>Gates: {sprint.gates.filter(g => g.status === "passed").length}/{sprint.gates.length} passed</span>
      </div>

      {/* View activity logs */}
      <button
        onClick={() => setActiveTab("activity")}
        className="text-xs text-sprints hover:underline"
      >
        View activity logs
      </button>
    </div>
  </div>
)
```

- [ ] **Step 3: Move ExpandedGatePanel inline styling**

Update `ExpandedGatePanel` to not have its own border-b (it's now inside the gate list, not at the top):

```typescript
// Change the outer div from:
<div className="px-4 py-3 border-b border-border-default bg-bg-elevated">
// To:
<div className="px-4 py-3 bg-bg-elevated/50 border-t border-border-subtle">
```

Remove the close button — clicking the gate row again closes it.

- [ ] **Step 4: Simplify header — remove stepper, add pause/resume**

Replace the header (lines 236-310) with a compact version:

```tsx
<div className="px-4 py-3 border-b border-border-default shrink-0">
  <div className="flex items-center gap-2">
    {onBack && (
      <button onClick={onBack} className="p-0.5 rounded text-text-tertiary hover:text-text-primary transition-all shrink-0">
        <ArrowLeftIcon size={14} />
      </button>
    )}
    <h2 className="text-title-md font-semibold text-text-primary truncate">
      {sprint.name}
    </h2>
    <span className={cn("text-2xs font-medium px-1.5 py-0.5 rounded-full", badge.class)}>
      {badge.label}
    </span>
    {totalGates > 0 && (
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 bg-border-default rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", progressPct === 100 ? "bg-sessions" : "bg-sprints")} style={{ width: `${progressPct}%` }} />
        </div>
        <span className="text-2xs font-medium text-text-tertiary">{progressPct}%</span>
      </div>
    )}

    {/* Pause/Resume + View Spec */}
    <div className="flex items-center gap-2 ml-auto shrink-0">
      {sprint.status === "in_progress" && (
        <button onClick={handlePause} className="px-2 py-0.5 text-xs font-medium text-sprints bg-sprints/10 rounded hover:bg-sprints/20 transition-all">
          Pause
        </button>
      )}
      {sprint.status === "paused" && (
        <button onClick={handleResume} className="px-2 py-0.5 text-xs font-medium text-sessions bg-sessions/10 rounded hover:bg-sessions/20 transition-all">
          Resume
        </button>
      )}
      <button onClick={handleViewSpec} className={cn("flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded transition-all", specPanelOpen ? "bg-sprints/15 text-sprints" : "text-text-ghost hover:text-text-secondary")}>
        <SprintsIcon size={12} /> Spec
      </button>
      <span className="text-xs text-text-ghost">{formatElapsed(sprint.startedAt)}</span>
      {eta && <span className="text-xs text-text-ghost">ETA {eta}</span>}
    </div>
  </div>
</div>
```

- [ ] **Step 5: Add pause/resume handlers**

Add to sprint-detail.tsx:

```typescript
const handlePause = useCallback(async () => {
  try {
    await fetch(`/api/sprints/${sprint.id}/pause`, { method: "POST" });
    addToast("Sprint paused", "success");
  } catch {
    addToast("Failed to pause sprint", "error");
  }
}, [sprint.id, addToast]);

const handleResume = useCallback(async () => {
  try {
    await fetch(`/api/sprints/${sprint.id}/resume`, { method: "POST" });
    addToast("Sprint resumed", "success");
  } catch {
    addToast("Failed to resume sprint", "error");
  }
}, [sprint.id, addToast]);
```

- [ ] **Step 6: Add pause/resume API endpoints**

In `server/routes/sprint.ts`, add:

```typescript
router.post("/:id/pause", (req, res) => {
  // Update sprint status to paused
  const sprint = sprintManager.getSprint(req.params.id);
  if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
  sprintManager.updateSprintStatus(req.params.id, "paused");
  res.json({ ok: true });
});

router.post("/:id/resume", (req, res) => {
  const sprint = sprintManager.getSprint(req.params.id);
  if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
  sprintManager.updateSprintStatus(req.params.id, "in_progress");
  res.json({ ok: true });
});
```

- [ ] **Step 7: Delete gate-stepper.tsx**

```bash
rm src/components/sprints/gate-stepper.tsx
```

Remove any remaining imports of `GateStepper` from other files.

- [ ] **Step 8: Test**

1. Open sprints page → verify vertical gate list renders
2. Click a gate → details expand BELOW it
3. Click again → collapses
4. Verify agents are in footer, not a section
5. Verify pause/resume buttons work
6. Verify approve button shows on ready gates

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: sprint page vertical redesign with pause/resume and runtime stats"
```

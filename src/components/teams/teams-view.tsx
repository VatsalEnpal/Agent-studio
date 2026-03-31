"use client";

import { useEffect, useCallback } from "react";
import { Loader2, Settings } from "lucide-react";
import { wsClient } from "@/lib/ws-client";
import {
  useWorkflowStore,
  type WorkflowFlow,
} from "@/stores/workflows";
import { useUIStore } from "@/stores/ui";
import type { WsMessage } from "@/lib/types";
import { FlowSidebar } from "./flow-sidebar";
import { StepTimeline } from "./step-timeline";
import { WorkflowBuilderDialog } from "./workflow-builder-dialog";

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function TeamsView() {
  const {
    flows,
    selectedFlowId,
    selectedRunId,
    loading,
    setFlows,
    selectRun,
    setLoading,
  } = useWorkflowStore();

  const openBuilder = useWorkflowStore((s) => s.openBuilder);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    const data = await fetchJson<WorkflowFlow[]>("/api/workflows");
    if (data) {
      setFlows(data);

      // Auto-select first run if nothing selected
      const currentFlowId = useWorkflowStore.getState().selectedFlowId;
      if (!currentFlowId && data.length > 0) {
        const firstFlow = data[0]!;
        if (firstFlow.runs.length > 0) {
          selectRun(firstFlow.id, firstFlow.runs[0]!.id);
        }
      }
    }
    setLoading(false);
  }, [setFlows, selectRun, setLoading]);

  // Fetch on mount
  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  // Listen for workflow updates via WebSocket
  useEffect(() => {
    const unsub = wsClient.on("workflow-update", (msg: WsMessage) => {
      if (Array.isArray(msg.payload)) {
        setFlows(msg.payload as WorkflowFlow[]);
      }
    });
    return unsub;
  }, [setFlows]);

  // Find selected run
  const selectedFlow = flows.find((f) => f.id === selectedFlowId);
  const selectedRun = selectedFlow?.runs.find((r) => r.id === selectedRunId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="space-y-3 w-56">
          <div className="skeleton h-4 w-3/4 mx-auto" />
          <div className="skeleton h-3 w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  if (flows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md px-6 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-console-faint/50 flex items-center justify-center mx-auto">
            <span className="text-xl">&#x1F91D;</span>
          </div>
          <p className="text-console-muted text-sm font-medium">No workflows yet</p>
          <p className="text-console-dim text-xs leading-relaxed">
            Workflows track your agent team&apos;s progress through sprints and tasks.
          </p>
          <div className="text-console-dim text-xs leading-relaxed text-left inline-block">
            <p className="mb-1.5 text-console-muted font-medium">To get started:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Create an agent system in Settings &rarr; Workspace</li>
              <li>Launch a sprint with the orchestrator agent</li>
              <li>Workflow steps will appear here automatically</li>
            </ol>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => useUIStore.getState().setActiveMode("settings")}
              className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-medium text-console-muted bg-console-faint hover:bg-console-faint/80 rounded-lg border border-console-border hover:border-console-muted transition-all"
            >
              <Settings className="w-3 h-3" />
              Go to Settings
            </button>
            <button
              onClick={() => openBuilder()}
              className="btn-lift px-4 py-2 text-[10px] font-medium text-console-bg bg-console-accent rounded-lg hover:bg-amber-400 hover:shadow-glow-sm transition-all"
            >
              Create Workflow
            </button>
          </div>
          <WorkflowBuilderDialog />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Flow sidebar */}
      <FlowSidebar
        flows={flows}
        selectedFlowId={selectedFlowId}
        selectedRunId={selectedRunId}
        onSelectRun={selectRun}
      />

      {/* Right: Step timeline */}
      <div className="flex-1 min-w-0 min-h-0">
        {selectedRun ? (
          <StepTimeline run={selectedRun} />
        ) : (
          <div className="flex items-center justify-center h-full text-console-dim text-[11px]">
            Select a run to view its timeline
          </div>
        )}
      </div>

      {/* Builder dialog */}
      <WorkflowBuilderDialog />
    </div>
  );
}

"use client";

import { useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { wsClient } from "@/lib/ws-client";
import {
  useWorkflowStore,
  type WorkflowFlow,
} from "@/stores/workflows";
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
          <p className="text-console-muted text-sm font-medium">No workflows running.</p>
          <p className="text-console-dim text-xs leading-relaxed">
            Workflows coordinate multiple agents on a task &mdash;
            like a sprint where backend, frontend, and QA agents
            work together in sequence.
          </p>
          <p className="text-console-dim text-xs">
            Start a Sprint from the Sessions tab, or create a custom workflow.
          </p>
          <button
            onClick={() => openBuilder()}
            className="btn-lift px-4 py-2 text-[10px] font-medium text-console-bg bg-console-accent rounded-lg hover:bg-amber-400 hover:shadow-glow-sm transition-all"
          >
            Create Workflow
          </button>
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

"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { wsClient } from "@/lib/ws-client";
import {
  useWorkflowStore,
  type WorkflowFlow,
} from "@/stores/workflows";
import type { WsMessage } from "@/lib/types";
import { FlowSidebar } from "./flow-sidebar";
import { StepTimeline } from "./step-timeline";
import { RoomList } from "./room-list";
import { RoomChat } from "./room-chat";
import { CreateRoomDialog } from "./create-room-dialog";

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
  const [mode, setMode] = useState<"rooms" | "sprints">("rooms");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Workflow state for sprints mode
  const {
    flows,
    selectedFlowId,
    selectedRunId,
    loading,
    setFlows,
    selectRun,
    setLoading,
  } = useWorkflowStore();

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    const data = await fetchJson<WorkflowFlow[]>("/api/workflows");
    if (data) {
      setFlows(data);
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

  useEffect(() => {
    if (mode === "sprints") {
      void loadWorkflows();
    }
  }, [mode, loadWorkflows]);

  useEffect(() => {
    const unsub = wsClient.on("workflow-update", (msg: WsMessage) => {
      if (Array.isArray(msg.payload)) {
        setFlows(msg.payload as WorkflowFlow[]);
      }
    });
    return unsub;
  }, [setFlows]);

  const selectedFlow = flows.find((f) => f.id === selectedFlowId);
  const selectedRun = selectedFlow?.runs.find((r) => r.id === selectedRunId);

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="w-[260px] shrink-0 border-r border-console-border bg-console-panel flex flex-col h-full overflow-hidden">
        {/* Mode toggle */}
        <div className="px-3 py-2 border-b border-console-border flex gap-1 shrink-0">
          <button
            onClick={() => setMode("rooms")}
            className={cn(
              "px-3 py-1 text-[10px] font-medium rounded transition-colors",
              mode === "rooms"
                ? "bg-console-accent text-black"
                : "text-console-muted hover:text-console-text",
            )}
          >
            Rooms
          </button>
          <button
            onClick={() => setMode("sprints")}
            className={cn(
              "px-3 py-1 text-[10px] font-medium rounded transition-colors",
              mode === "sprints"
                ? "bg-console-accent text-black"
                : "text-console-muted hover:text-console-text",
            )}
          >
            Sprints
          </button>
        </div>

        {/* Sidebar content */}
        {mode === "rooms" ? (
          <RoomList onCreateRoom={() => setCreateDialogOpen(true)} />
        ) : loading ? (
          <div className="flex items-center justify-center flex-1 gap-2 text-console-dim">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[10px]">Loading...</span>
          </div>
        ) : (
          <FlowSidebar
            flows={flows}
            selectedFlowId={selectedFlowId}
            selectedRunId={selectedRunId}
            onSelectRun={selectRun}
          />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 min-h-0">
        {mode === "rooms" ? (
          <RoomChat />
        ) : selectedRun ? (
          <StepTimeline run={selectedRun} />
        ) : (
          <div className="flex items-center justify-center h-full text-console-dim text-[11px]">
            {flows.length === 0
              ? "No workflows configured."
              : "Select a run to view its timeline"}
          </div>
        )}
      </div>

      {/* Create room dialog */}
      <CreateRoomDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}

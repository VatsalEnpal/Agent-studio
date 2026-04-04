"use client";

import { useState, useEffect, useCallback } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
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

  // Sidebar is already provided by page.tsx SidebarShell — only render main content
  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 min-h-0">
        <RoomChat />
      </div>

      {/* Create room dialog */}
      <CreateRoomDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}

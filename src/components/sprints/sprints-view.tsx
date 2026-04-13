"use client";

import { useEffect, useCallback } from "react";
import { SprintsIcon, SettingsIcon } from "@/components/ui/icons";
import { useSprintsStore, type Sprint } from "@/stores/sprints";
import { useHasAgentSystem } from "@/hooks/use-config";
import { useUIStore } from "@/stores/ui";
import { wsClient } from "@/lib/ws-client";
import type { WsMessage } from "@/lib/types";
import { SprintList } from "./sprint-list";
import { SprintDetail } from "./sprint-detail";

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function SprintsView() {
  const sprints = useSprintsStore((s) => s.sprints);
  const selectedSprintId = useSprintsStore((s) => s.selectedSprintId);
  const loading = useSprintsStore((s) => s.loading);
  const setSprints = useSprintsStore((s) => s.setSprints);
  const selectSprint = useSprintsStore((s) => s.selectSprint);
  const setLoading = useSprintsStore((s) => s.setLoading);

  const loadSprints = useCallback(async () => {
    setLoading(true);
    const data = await fetchJson<Sprint[]>("/api/sprints");
    if (data) {
      setSprints(data);
      // Auto-select first active sprint
      if (!useSprintsStore.getState().selectedSprintId && data.length > 0) {
        const active = data.find(
          (s) => s.status === "in_progress" || s.status === "launching" || s.status === "paused",
        );
        selectSprint(active?.id ?? data[0]!.id);
      }
    }
    setLoading(false);
  }, [setSprints, selectSprint, setLoading]);

  useEffect(() => {
    void loadSprints();
  }, [loadSprints]);

  // Listen for real-time sprint updates
  useEffect(() => {
    const unsub = wsClient.on("workflow-update", (msg: WsMessage) => {
      if (Array.isArray(msg.payload)) {
        setSprints(msg.payload as Sprint[]);
      }
    });
    return unsub;
  }, [setSprints]);

  // Auto-select when selection is stale (sprint deleted, back button, WebSocket update)
  useEffect(() => {
    if (sprints.length === 0) return;
    const stillExists = selectedSprintId && sprints.some((s) => s.id === selectedSprintId);
    if (!stillExists) {
      const active = sprints.find(
        (s) => s.status === "in_progress" || s.status === "launching" || s.status === "paused",
      );
      selectSprint(active?.id ?? sprints[0]!.id);
    }
  }, [sprints, selectedSprintId, selectSprint]);

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);
  const hasAgentSystem = useHasAgentSystem();

  // Sidebar is already provided by page.tsx SidebarShell — only render main content
  return (
    <div className="h-full">
      {selectedSprint ? (
        <SprintDetail sprint={selectedSprint} onBack={() => selectSprint(null)} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
          <div className="w-12 h-12 rounded bg-bg-elevated flex items-center justify-center">
            <SprintsIcon size={20} className="text-text-ghost" />
          </div>
          <p className="text-xs font-medium text-text-secondary">
            {sprints.length === 0 ? "No sprints running" : "Select a sprint to view details"}
          </p>
          {sprints.length === 0 && (
            <>
              <p className="text-xs text-text-tertiary max-w-[300px] leading-relaxed">
                {hasAgentSystem
                  ? "Sprints are automated multi-agent pipelines. The PMO agent detects pending work, distributes it to your agents, and loops through build/test cycles until passing."
                  : "Sprints are automated multi-agent pipelines that build, test, and fix code without manual intervention. Set up an agent system first to enable them."}
              </p>
              {!hasAgentSystem && (
                <button
                  onClick={() => useUIStore.getState().setActiveMode("settings")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-label font-medium text-text-secondary bg-bg-elevated hover:bg-bg-elevated/80 rounded border border-border-default hover:border-text-secondary transition-all"
                >
                  <SettingsIcon size={12} />
                  Create Agent System
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

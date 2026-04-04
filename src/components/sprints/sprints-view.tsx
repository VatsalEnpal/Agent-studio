"use client";

import { useEffect, useCallback } from "react";
import { SprintsIcon } from "@/components/ui/icons";
import { useSprintsStore, type Sprint } from "@/stores/sprints";
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
          (s) =>
            s.status === "in_progress" ||
            s.status === "launching" ||
            s.status === "paused",
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

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);

  // Sidebar is already provided by page.tsx SidebarShell — only render main content
  return (
    <div className="h-full">
      {selectedSprint ? (
        <SprintDetail sprint={selectedSprint} onBack={() => selectSprint(null)} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
          <div className="w-12 h-12 rounded-xl bg-bg-elevated flex items-center justify-center">
            <SprintsIcon size={20} className="text-text-ghost" />
          </div>
          <p className="text-[10px] font-medium text-text-secondary">
            {sprints.length === 0
              ? "No sprints found"
              : "Select a sprint to view details"}
          </p>
          {sprints.length === 0 && (
            <p className="text-[10px] text-text-tertiary max-w-[240px] leading-relaxed">
              Sprints are created automatically by the PMO agent when it detects pending work in your projects.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { PlusIcon, SidebarIcon } from "@/components/ui/icons";
import { useUIStore } from "@/stores/ui";
import { SessionsSection } from "./sessions-section";
import { ServersSection } from "./servers-section";
import { RunningSection } from "./running-section";
import { RecentSection } from "./recent-section";
import { ReposSection } from "./repos-section";

interface SidebarProps {
  onNewSession: () => void;
  onKillSession: (id: string) => void;
}

export function Sidebar({ onNewSession, onKillSession }: SidebarProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <aside className="w-56 border-r border-border-default bg-bg-surface shrink-0 flex flex-col h-full">
      {/* New Session button + collapse */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border-default">
        <button
          onClick={onNewSession}
          className="flex items-center gap-1.5 flex-1 px-2 py-1.5 text-xs font-medium rounded bg-rooms/15 text-rooms hover:bg-rooms/25 active:bg-rooms/35 active:scale-95 transition-all btn-lift"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New Session
        </button>
        <button
          onClick={toggleSidebar}
          className="p-1 text-text-tertiary hover:text-text-secondary transition-all"
          title="Collapse sidebar"
        >
          <SidebarIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2 px-1 space-y-4">
        <SessionsSection onKillSession={onKillSession} />
        <ServersSection />
        <RunningSection />
        <RecentSection />
        <ReposSection />
      </div>
    </aside>
  );
}

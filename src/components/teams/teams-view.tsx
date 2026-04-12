"use client";

import { useState } from "react";
import { RoomChat } from "./room-chat";
import { CreateRoomDialog } from "./create-room-dialog";

export function TeamsView() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

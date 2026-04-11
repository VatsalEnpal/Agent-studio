"use client";

import { useEffect, useCallback } from "react";
import { Hash, Plus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoomsStore } from "@/stores/rooms";
import type { Room } from "@/stores/rooms";

interface RoomListProps {
  onCreateRoom: () => void;
}

export function RoomList({ onCreateRoom }: RoomListProps) {
  const rooms = useRoomsStore((s) => s.rooms);
  const selectedRoomId = useRoomsStore((s) => s.selectedRoomId);
  const selectRoom = useRoomsStore((s) => s.selectRoom);
  const setRooms = useRoomsStore((s) => s.setRooms);
  const setLoading = useRoomsStore((s) => s.setLoading);
  const lastSeenByRoom = useRoomsStore((s) => s.lastSeenByRoom);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rooms");
      if (res.ok) {
        const data = (await res.json()) as Room[];
        setRooms(data);
        // Auto-select first room if none selected
        const firstRoom = data[0];
        if (!useRoomsStore.getState().selectedRoomId && firstRoom) {
          selectRoom(firstRoom.id);
        }
      }
    } catch {
      // ignore fetch errors
    }
    setLoading(false);
  }, [setRooms, selectRoom, setLoading]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const handleCloseRoom = useCallback(
    async (e: React.MouseEvent, roomId: string) => {
      e.stopPropagation();
      try {
        await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
        // Reload rooms
        const res = await fetch("/api/rooms");
        if (res.ok) {
          const data = (await res.json()) as Room[];
          useRoomsStore.getState().setRooms(data);
          if (selectedRoomId === roomId) {
            const active = data.filter((r) => r.active);
            const firstActive = active[0];
            useRoomsStore
              .getState()
              .selectRoom(firstActive ? firstActive.id : null);
          }
        }
      } catch {
        // ignore
      }
    },
    [selectedRoomId],
  );

  const activeRooms = rooms.filter((r) => r.active);
  const archivedRooms = rooms.filter((r) => !r.active);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-console-border shrink-0 flex items-center justify-between">
        <h3 className="text-[10px] font-medium text-console-muted uppercase tracking-wider">
          Rooms
        </h3>
        <button
          onClick={onCreateRoom}
          className="p-1 rounded text-console-dim hover:text-console-accent hover:bg-console-faint transition-colors"
          title="New room"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {activeRooms.map((room) => (
          <RoomItem
            key={room.id}
            room={room}
            selected={room.id === selectedRoomId}
            onSelect={() => selectRoom(room.id)}
            onClose={(e) => void handleCloseRoom(e, room.id)}
            lastSeen={lastSeenByRoom[room.id]}
          />
        ))}

        {activeRooms.length === 0 && (
          <div className="text-[10px] text-console-dim text-center py-6 px-2 leading-relaxed">
            No rooms yet.
            <br />
            Create one to start a team chat.
          </div>
        )}

        {archivedRooms.length > 0 && (
          <>
            <div className="pt-3 pb-1 px-2">
              <span className="text-[8px] font-medium text-console-dim uppercase tracking-wider">
                Archived
              </span>
            </div>
            {archivedRooms.map((room) => (
              <RoomItem
                key={room.id}
                room={room}
                selected={room.id === selectedRoomId}
                onSelect={() => selectRoom(room.id)}
                lastSeen={lastSeenByRoom[room.id]}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function RoomItem({
  room,
  selected,
  onSelect,
  onClose,
  lastSeen,
}: {
  room: Room;
  selected: boolean;
  onSelect: () => void;
  onClose?: (e: React.MouseEvent) => void;
  lastSeen?: string | undefined;
}) {
  const agents = room.agents ?? [];
  const onlineCount = agents.filter((a) => a.status !== "offline").length;
  const workingCount = agents.filter((a) => a.status === "working").length;

  // Count unread messages since last seen
  const messages = room.messages ?? [];
  const unreadCount = lastSeen
    ? messages.filter(
        (m) => new Date(m.timestamp) > new Date(lastSeen) && m.from !== "user",
      ).length
    : messages.filter((m) => m.from !== "user").length;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-2 w-full px-2.5 py-2 rounded text-left transition-colors",
        selected
          ? "bg-console-faint border-l-2 border-console-accent"
          : "hover:bg-console-faint/30 border-l-2 border-transparent",
        !room.active && "opacity-50",
      )}
    >
      <Hash className="w-3.5 h-3.5 text-console-dim shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[11px] font-medium truncate",
              selected ? "text-console-text" : "text-console-muted",
            )}
          >
            {room.name}
          </span>
          {workingCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-console-accent animate-pulse shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Users className="w-2.5 h-2.5 text-console-dim" />
          <span className="text-[8px] text-console-dim">
            {agents.length} agents
            {onlineCount > 0 && ` (${onlineCount} online)`}
          </span>
        </div>
      </div>

      {/* Unread badge */}
      {!selected && unreadCount > 0 && (
        <span className="bg-console-accent text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}

      {/* Close button on hover (active rooms only) */}
      {room.active && onClose && (
        <button
          onClick={onClose}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-console-dim hover:text-red-400 transition-all shrink-0"
          title="Close room"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </button>
  );
}

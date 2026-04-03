"use client";

import { useEffect, useCallback } from "react";
import { Hash, Plus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
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
        if (!useRoomsStore.getState().selectedRoomId && data.length > 0) {
          selectRoom(data[0].id);
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
        const res = await fetch("/api/rooms");
        if (res.ok) {
          const data = (await res.json()) as Room[];
          useRoomsStore.getState().setRooms(data);
          if (selectedRoomId === roomId) {
            const active = data.filter((r) => r.active);
            useRoomsStore
              .getState()
              .selectRoom(active.length > 0 ? active[0].id : null);
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
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border shrink-0 flex items-center justify-between">
        <h3 className="text-label-xs text-text-secondary uppercase tracking-wider">
          Rooms
        </h3>
        <button
          onClick={onCreateRoom}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-label-xs font-medium bg-accent text-canvas hover:bg-accent-hover transition-colors duration-[100ms]"
          title="New room"
        >
          <Plus className="w-3 h-3" />
          New Room
        </button>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 scrollbar-thin">
        {/* Active section */}
        {activeRooms.length > 0 && (
          <div className="px-2 pt-1 pb-2">
            <span className="text-label-xs text-text-tertiary uppercase tracking-[0.06em]">
              Active
            </span>
          </div>
        )}
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
          <div className="text-body-sm text-text-tertiary text-center py-8 px-4 leading-relaxed">
            No rooms yet.
            <br />
            <span className="text-text-secondary">Create one to start a team chat.</span>
          </div>
        )}

        {/* Archived section */}
        {archivedRooms.length > 0 && (
          <>
            <div className="px-2 pt-4 pb-2">
              <span className="text-label-xs text-text-tertiary uppercase tracking-[0.06em]">
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
  lastSeen?: string;
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
        "group flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors duration-[100ms]",
        selected
          ? "bg-surface-hover"
          : "hover:bg-surface-hover/50",
        !room.active && "opacity-50",
      )}
    >
      <Hash className="w-3.5 h-3.5 text-text-tertiary shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-body-sm font-medium truncate",
              selected ? "text-text-emphasis" : "text-text-primary",
            )}
          >
            {room.name}
          </span>
          {workingCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {/* Agent avatar dots */}
          <div className="flex -space-x-1">
            {agents.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="w-3 h-3 rounded-full border border-surface flex items-center justify-center"
                style={{ backgroundColor: agentColor(a.name) }}
                title={`${a.name}: ${a.status}`}
              >
                <span className="text-[5px] font-bold text-white/90 leading-none">
                  {a.name.charAt(0).toUpperCase()}
                </span>
              </div>
            ))}
          </div>
          <span className="text-label-xs text-text-tertiary">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
            {onlineCount > 0 && (
              <span className="text-success"> &middot; {onlineCount} online</span>
            )}
          </span>
        </div>
      </div>

      {/* Status badge */}
      {room.active ? (
        workingCount > 0 ? (
          <span className="text-label-xs px-1.5 py-0.5 rounded-full font-medium bg-accent-subtle text-accent shrink-0">
            Active
          </span>
        ) : (
          <span className="text-label-xs px-1.5 py-0.5 rounded-full font-medium bg-success-subtle text-success shrink-0">
            Idle
          </span>
        )
      ) : null}

      {/* Unread badge */}
      {!selected && unreadCount > 0 && (
        <span className="bg-accent text-canvas text-label-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 min-w-[20px] text-center">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}

      {/* Close button on hover */}
      {room.active && onClose && (
        <button
          onClick={onClose}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-error transition-all duration-[100ms] shrink-0"
          title="Close room"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </button>
  );
}

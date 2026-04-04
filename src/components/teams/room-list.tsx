"use client";

import { useEffect, useCallback } from "react";
import { HashIcon, PlusIcon, CloseIcon } from "@/components/ui/icons";
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
  const loading = useRoomsStore((s) => s.loading);
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
      {/* Tab nav area */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex rounded-md bg-bg-input p-0.5">
          <button className="flex-1 px-2 py-1 text-[10px] font-medium rounded-[3px] bg-bg-elevated text-text-primary">
            Rooms
          </button>
          <button className="flex-1 px-2 py-1 text-[10px] font-medium rounded-[3px] text-text-ghost hover:text-text-tertiary transition-colors">
            Agents
          </button>
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 scrollbar-thin">
        {/* Loading skeleton */}
        {loading && rooms.length === 0 && (
          <div className="px-2 py-3 space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
                <div className="skeleton w-3.5 h-3.5 rounded shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-3/4" />
                  <div className="skeleton h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active section */}
        {activeRooms.length > 0 && (
          <div className="px-2 pt-1 pb-2">
            <span className="text-label uppercase text-text-ghost tracking-[0.06em]">
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
          <div className="text-center py-6 px-4">
            <HashIcon size={20} className="text-text-ghost mx-auto mb-2" />
            <p className="text-[10px] text-text-secondary font-medium">No rooms yet</p>
            <p className="text-[10px] text-text-tertiary mt-1">Create one to start a team chat</p>
          </div>
        )}

        {/* Archived section */}
        {archivedRooms.length > 0 && (
          <>
            <div className="px-2 pt-4 pb-2">
              <span className="text-label uppercase text-text-ghost tracking-[0.06em]">
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

      {/* Bottom: New Room button */}
      <div className="px-3 py-2 border-t border-border-default">
        <button
          onClick={onCreateRoom}
          className={cn(
            "flex items-center justify-center gap-1.5 w-full",
            "px-3 py-1.5 rounded-md",
            "text-[10px] font-medium",
            "border border-dashed border-rooms/40 text-rooms",
            "hover:bg-rooms/5 hover:border-rooms/60",
            "active:scale-[0.98] transition-all",
          )}
          title="New room"
        >
          <PlusIcon size={12} />
          New Room
        </button>
        <p className="text-center text-[9px] text-text-ghost mt-0.5">
          Tip: use {"\u2318"}K to search rooms
        </p>
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

  const messages = room.messages ?? [];
  const unreadCount = !room.active ? 0 : lastSeen
    ? messages.filter(
        (m) => new Date(m.timestamp) > new Date(lastSeen) && m.from !== "user",
      ).length
    : messages.filter((m) => m.from !== "user").length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      className={cn(
        "group flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer",
        selected
          ? "bg-rooms-subtle border border-rooms/20"
          : "hover:bg-bg-elevated/50 border border-transparent",
        !room.active && "opacity-50",
      )}
    >
      <HashIcon size={12} className="text-text-ghost shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[10px] truncate",
              selected ? "text-text-primary font-medium" : "text-text-secondary",
            )}
          >
            {room.name}
          </span>
          {workingCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-rooms animate-pulse-dot shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {room.active ? (
            <>
              {/* Agent avatar dots */}
              <div className="flex -space-x-1">
                {agents.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="w-3 h-3 rounded-[2px] flex items-center justify-center"
                    style={{ backgroundColor: agentColor(a.name) }}
                    title={`${a.name}: ${a.status}`}
                  >
                    <span className="text-[5px] font-bold text-white/90 leading-none">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
              <span className="text-[10px] text-text-ghost">
                {agents.length} agent{agents.length !== 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <span className="text-[10px] text-text-ghost italic">Legacy</span>
          )}
        </div>
      </div>

      {/* Unread badge */}
      {!selected && unreadCount > 0 && (
        <span className="bg-rooms text-bg-base text-label font-bold px-1.5 py-0.5 rounded-full shrink-0 min-w-[20px] text-center">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}

      {/* Close button on hover */}
      {room.active && onClose && (
        <button
          onClick={onClose}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-text-ghost hover:text-error transition-all shrink-0"
          title="Close room"
        >
          <CloseIcon size={10} />
        </button>
      )}
    </div>
  );
}

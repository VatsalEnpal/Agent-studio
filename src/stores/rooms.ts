import { create } from "zustand";

export interface RoomAgent {
  id: string;
  name: string;
  model: "opus" | "sonnet" | "haiku";
  sessionId?: string;
  status: "offline" | "idle" | "working" | "waiting";
}

export interface RoomMessage {
  id: string;
  roomId: string;
  from: string;
  to?: string;
  text: string;
  timestamp: string;
  type: "message" | "action" | "approval-request" | "system";
  approvalStatus?: "pending" | "approved" | "rejected";
  actionCommand?: string;
}

export interface Room {
  id: string;
  name: string;
  topic: string;
  agents: RoomAgent[];
  messages: RoomMessage[];
  active: boolean;
  createdAt: string;
}

interface RoomsState {
  rooms: Room[];
  selectedRoomId: string | null;
  loading: boolean;
  lastSeenByRoom: Record<string, string>; // roomId -> ISO timestamp

  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  selectRoom: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  addMessage: (roomId: string, msg: RoomMessage) => void;
  updateAgentStatus: (roomId: string, agentId: string, status: RoomAgent["status"]) => void;
  updateApproval: (roomId: string, messageId: string, approved: boolean) => void;
  markRoomSeen: (roomId: string) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
  rooms: [],
  selectedRoomId: null,
  loading: false,
  lastSeenByRoom: {},

  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((state) => ({ rooms: [...state.rooms, room] })),
  selectRoom: (id) => set((state) => ({
    selectedRoomId: id,
    lastSeenByRoom: id
      ? { ...state.lastSeenByRoom, [id]: new Date().toISOString() }
      : state.lastSeenByRoom,
  })),
  setLoading: (loading) => set({ loading }),

  addMessage: (roomId, msg) =>
    set((state) => {
      const room = state.rooms.find((r) => r.id === roomId);
      // Deduplicate: skip if message with this ID already exists
      if (room?.messages.some((m) => m.id === msg.id)) {
        return state;
      }
      return {
        rooms: state.rooms.map((r) =>
          r.id === roomId ? { ...r, messages: [...r.messages, msg] } : r,
        ),
      };
    }),

  markRoomSeen: (roomId) =>
    set((state) => ({
      lastSeenByRoom: { ...state.lastSeenByRoom, [roomId]: new Date().toISOString() },
    })),

  updateAgentStatus: (roomId, agentId, status) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              agents: r.agents.map((a) =>
                a.id === agentId ? { ...a, status } : a,
              ),
            }
          : r,
      ),
    })),

  updateApproval: (roomId, messageId, approved) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              messages: r.messages.map((m) =>
                m.id === messageId
                  ? { ...m, approvalStatus: approved ? "approved" as const : "rejected" as const }
                  : m,
              ),
            }
          : r,
      ),
    })),
}));

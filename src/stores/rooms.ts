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

export interface TypingAgent {
  agentId: string;
  activity: string;
  startedAt: string;
}

interface RoomsState {
  rooms: Room[];
  selectedRoomId: string | null;
  loading: boolean;
  lastSeenByRoom: Record<string, string>;

  // Streaming state (TalkTo-style)
  typingAgents: Record<string, TypingAgent[]>;    // roomId -> agent activity info
  streamingText: Record<string, string>;           // agentId -> accumulated text so far

  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  selectRoom: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  addMessage: (roomId: string, msg: RoomMessage) => void;
  updateAgentStatus: (roomId: string, agentId: string, status: RoomAgent["status"]) => void;
  updateApproval: (roomId: string, messageId: string, approved: boolean) => void;
  markRoomSeen: (roomId: string) => void;

  // Streaming actions
  setAgentTyping: (roomId: string, agentId: string) => void;
  updateAgentActivity: (roomId: string, agentId: string, activity: string) => void;
  appendStreamingDelta: (roomId: string, agentId: string, delta: string) => void;
  clearStreaming: (roomId: string, agentId: string) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
  rooms: [],
  selectedRoomId: null,
  loading: false,
  lastSeenByRoom: {},
  typingAgents: {},
  streamingText: {},

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
      if (room?.messages.some((m) => m.id === msg.id)) {
        return state;
      }
      // Clear streaming state for this agent when final message arrives
      const newStreamingText = { ...state.streamingText };
      delete newStreamingText[msg.from];
      const newTyping = { ...state.typingAgents };
      if (newTyping[roomId]) {
        newTyping[roomId] = newTyping[roomId].filter((ta) => ta.agentId !== msg.from);
      }
      return {
        rooms: state.rooms.map((r) =>
          r.id === roomId ? { ...r, messages: [...r.messages, msg] } : r,
        ),
        streamingText: newStreamingText,
        typingAgents: newTyping,
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

  // --- Streaming actions ---
  setAgentTyping: (roomId, agentId) =>
    set((state) => {
      const current = state.typingAgents[roomId] ?? [];
      if (current.some((ta) => ta.agentId === agentId)) return state;
      const entry: TypingAgent = { agentId, activity: "", startedAt: new Date().toISOString() };
      return {
        typingAgents: { ...state.typingAgents, [roomId]: [...current, entry] },
        streamingText: { ...state.streamingText, [agentId]: "" },
      };
    }),

  updateAgentActivity: (roomId, agentId, activity) =>
    set((state) => {
      const current = state.typingAgents[roomId];
      if (!current) return state;
      return {
        typingAgents: {
          ...state.typingAgents,
          [roomId]: current.map((ta) =>
            ta.agentId === agentId ? { ...ta, activity } : ta,
          ),
        },
      };
    }),

  appendStreamingDelta: (_roomId, agentId, delta) =>
    set((state) => ({
      streamingText: {
        ...state.streamingText,
        [agentId]: (state.streamingText[agentId] ?? "") + delta,
      },
    })),

  clearStreaming: (roomId, agentId) =>
    set((state) => {
      const newStreamingText = { ...state.streamingText };
      delete newStreamingText[agentId];
      const newTyping = { ...state.typingAgents };
      if (newTyping[roomId]) {
        newTyping[roomId] = newTyping[roomId].filter((ta) => ta.agentId !== agentId);
      }
      return { streamingText: newStreamingText, typingAgents: newTyping };
    }),
}));

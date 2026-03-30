import { create } from "zustand";
import type { Session } from "@/lib/types";

const MAX_VISIBLE = 6;
const ZOOM_LEVELS = [10, 11, 12, 13, 14, 16, 18, 20] as const;
const DEFAULT_ZOOM = 13;

interface SessionsState {
  sessions: Session[];
  focusedId: string | null;
  visibleIds: string[];
  zoomLevels: Record<string, number>;

  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setFocused: (id: string | null) => void;
  swapIn: (id: string) => void;
  zoomIn: (id: string) => void;
  zoomOut: (id: string) => void;
  getZoom: (id: string) => number;
}

function computeVisible(sessions: Session[], current: string[]): string[] {
  const activeIds = sessions.map((s) => s.id);
  // Keep currently visible that still exist
  const kept = current.filter((id) => activeIds.includes(id));
  // Add new sessions not yet visible
  const newIds = activeIds.filter((id) => !kept.includes(id));
  const combined = [...kept, ...newIds];
  return combined.slice(0, MAX_VISIBLE);
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  focusedId: null,
  visibleIds: [],
  zoomLevels: {},

  setSessions: (sessions) => {
    const state = get();
    const visibleIds = computeVisible(sessions, state.visibleIds);
    const focusedId =
      state.focusedId && sessions.some((s) => s.id === state.focusedId)
        ? state.focusedId
        : visibleIds[0] ?? null;
    set({ sessions, visibleIds, focusedId });
  },

  addSession: (session) => {
    const state = get();
    const sessions = [...state.sessions, session];
    const visibleIds = computeVisible(sessions, state.visibleIds);
    set({ sessions, visibleIds, focusedId: session.id });
  },

  removeSession: (id) => {
    const state = get();
    const sessions = state.sessions.filter((s) => s.id !== id);
    const visibleIds = computeVisible(sessions, state.visibleIds);
    const focusedId =
      state.focusedId === id ? (visibleIds[0] ?? null) : state.focusedId;
    set({ sessions, visibleIds, focusedId });
  },

  setFocused: (id) => set({ focusedId: id }),

  swapIn: (id) => {
    const state = get();
    if (state.visibleIds.includes(id)) {
      set({ focusedId: id });
      return;
    }
    // Replace last visible with this one
    const newVisible = [...state.visibleIds];
    if (newVisible.length >= MAX_VISIBLE) {
      newVisible[newVisible.length - 1] = id;
    } else {
      newVisible.push(id);
    }
    set({ visibleIds: newVisible, focusedId: id });
  },

  zoomIn: (id) => {
    const state = get();
    const current = state.zoomLevels[id] ?? DEFAULT_ZOOM;
    const idx = ZOOM_LEVELS.indexOf(current as (typeof ZOOM_LEVELS)[number]);
    const next = idx >= 0 && idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : current;
    set({ zoomLevels: { ...state.zoomLevels, [id]: next } });
  },

  zoomOut: (id) => {
    const state = get();
    const current = state.zoomLevels[id] ?? DEFAULT_ZOOM;
    const idx = ZOOM_LEVELS.indexOf(current as (typeof ZOOM_LEVELS)[number]);
    const prev = idx > 0 ? ZOOM_LEVELS[idx - 1] : current;
    set({ zoomLevels: { ...state.zoomLevels, [id]: prev } });
  },

  getZoom: (id) => {
    return get().zoomLevels[id] ?? DEFAULT_ZOOM;
  },
}));

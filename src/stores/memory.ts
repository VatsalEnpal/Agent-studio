import { create } from "zustand";

export interface MemoryEntry {
  file: string;
  title: string;
  key_point: string;
  tags: string[];
  category: string;
  agent_type: string;
  superseded_by?: string;
}

export interface MemoryEntryDetail {
  agent_type: string;
  memory_type: string;
  process_type?: string;
  title: string;
  content: {
    observation?: string;
    action?: string;
    outcome?: string;
    lesson?: string;
    [key: string]: unknown;
  };
  tags: string[];
  created_by: string;
  created_at: string;
  supersedes?: string;
  superseded_by?: string;
}

interface MemoryState {
  entries: MemoryEntry[];
  search: string;
  selectedCategory: string | null;
  selectedEntry: MemoryEntry | null;
  selectedDetail: MemoryEntryDetail | null;
  loading: boolean;
  detailLoading: boolean;

  setEntries: (entries: MemoryEntry[]) => void;
  setSearch: (s: string) => void;
  setCategory: (c: string | null) => void;
  selectEntry: (e: MemoryEntry | null) => void;
  setSelectedDetail: (d: MemoryEntryDetail | null) => void;
  setLoading: (l: boolean) => void;
  setDetailLoading: (l: boolean) => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  entries: [],
  search: "",
  selectedCategory: null,
  selectedEntry: null,
  selectedDetail: null,
  loading: false,
  detailLoading: false,

  setEntries: (entries) => set({ entries }),
  setSearch: (search) => set({ search }),
  setCategory: (selectedCategory) => set({ selectedCategory }),
  selectEntry: (selectedEntry) => set({ selectedEntry, selectedDetail: null }),
  setSelectedDetail: (selectedDetail) => set({ selectedDetail }),
  setLoading: (loading) => set({ loading }),
  setDetailLoading: (detailLoading) => set({ detailLoading }),
}));

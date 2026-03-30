import { create } from "zustand";

export interface MemoryEntry {
  file: string;
  title: string;
  key_point: string;
  tags: string[];
  category: string;
  agent_type: string;
  superseded_by?: string;
  pinned?: boolean;
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
  pinned?: boolean;
}

export interface MemoryFormData {
  title: string;
  category: string;
  content: {
    observation: string;
    action: string;
    outcome: string;
    lesson: string;
  };
  tags: string[];
  pinned: boolean;
}

interface MemoryState {
  entries: MemoryEntry[];
  search: string;
  selectedCategory: string | null;
  showPinnedOnly: boolean;
  selectedEntry: MemoryEntry | null;
  selectedDetail: MemoryEntryDetail | null;
  loading: boolean;
  detailLoading: boolean;
  createDialogOpen: boolean;
  editDialogOpen: boolean;
  deleteDialogOpen: boolean;
  editingEntry: MemoryEntry | null;
  saving: boolean;

  setEntries: (entries: MemoryEntry[]) => void;
  setSearch: (s: string) => void;
  setCategory: (c: string | null) => void;
  setShowPinnedOnly: (v: boolean) => void;
  selectEntry: (e: MemoryEntry | null) => void;
  setSelectedDetail: (d: MemoryEntryDetail | null) => void;
  setLoading: (l: boolean) => void;
  setDetailLoading: (l: boolean) => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  openEditDialog: (entry: MemoryEntry) => void;
  closeEditDialog: () => void;
  openDeleteDialog: (entry: MemoryEntry) => void;
  closeDeleteDialog: () => void;
  setSaving: (s: boolean) => void;
  updateEntry: (file: string, updates: Partial<MemoryEntry>) => void;
  removeEntry: (file: string) => void;
  addEntry: (entry: MemoryEntry) => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  entries: [],
  search: "",
  selectedCategory: null,
  showPinnedOnly: false,
  selectedEntry: null,
  selectedDetail: null,
  loading: false,
  detailLoading: false,
  createDialogOpen: false,
  editDialogOpen: false,
  deleteDialogOpen: false,
  editingEntry: null,
  saving: false,

  setEntries: (entries) => set({ entries }),
  setSearch: (search) => set({ search }),
  setCategory: (selectedCategory) => set({ selectedCategory }),
  setShowPinnedOnly: (showPinnedOnly) => set({ showPinnedOnly }),
  selectEntry: (selectedEntry) => set({ selectedEntry, selectedDetail: null }),
  setSelectedDetail: (selectedDetail) => set({ selectedDetail }),
  setLoading: (loading) => set({ loading }),
  setDetailLoading: (detailLoading) => set({ detailLoading }),
  openCreateDialog: () => set({ createDialogOpen: true }),
  closeCreateDialog: () => set({ createDialogOpen: false }),
  openEditDialog: (entry) => set({ editDialogOpen: true, editingEntry: entry }),
  closeEditDialog: () => set({ editDialogOpen: false, editingEntry: null }),
  openDeleteDialog: (entry) => set({ deleteDialogOpen: true, editingEntry: entry }),
  closeDeleteDialog: () => set({ deleteDialogOpen: false, editingEntry: null }),
  setSaving: (saving) => set({ saving }),
  updateEntry: (file, updates) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.file === file ? { ...e, ...updates } : e,
      ),
    })),
  removeEntry: (file) =>
    set((state) => ({
      entries: state.entries.filter((e) => e.file !== file),
      selectedEntry: state.selectedEntry?.file === file ? null : state.selectedEntry,
      selectedDetail: state.selectedEntry?.file === file ? null : state.selectedDetail,
    })),
  addEntry: (entry) =>
    set((state) => ({
      entries: [entry, ...state.entries],
    })),
}));

import { create } from "zustand";
import type { RepoStatus } from "@/lib/types";

interface GitState {
  repos: RepoStatus[];
  prStatus: "idle" | "creating" | "success" | "error";
  prResult: { url: string; id: number } | null;
  prError: string | null;
  prModalOpen: boolean;
  prModalRepo: RepoStatus | null;

  setRepos: (repos: RepoStatus[]) => void;
  setPrStatus: (status: GitState["prStatus"]) => void;
  setPrResult: (result: GitState["prResult"]) => void;
  setPrError: (error: string | null) => void;
  openPrModal: (repo: RepoStatus) => void;
  closePrModal: () => void;
  resetPr: () => void;
}

export const useGitStore = create<GitState>((set) => ({
  repos: [],
  prStatus: "idle",
  prResult: null,
  prError: null,
  prModalOpen: false,
  prModalRepo: null,

  setRepos: (repos) => set({ repos }),
  setPrStatus: (status) => set({ prStatus: status }),
  setPrResult: (result) => set({ prResult: result }),
  setPrError: (error) => set({ prError: error }),
  openPrModal: (repo) => set({ prModalOpen: true, prModalRepo: repo, prStatus: "idle", prResult: null, prError: null }),
  closePrModal: () => set({ prModalOpen: false, prModalRepo: null }),
  resetPr: () => set({ prStatus: "idle", prResult: null, prError: null }),
}));

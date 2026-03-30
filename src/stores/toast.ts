import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = "info") => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const toast: Toast = { id, message, type, createdAt: Date.now() };

    set((state) => ({
      toasts: [...state.toasts, toast].slice(-5), // Keep max 5 toasts
    }));

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

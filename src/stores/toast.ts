import { create } from "zustand";
import { useToastStore as useNotificationStore } from "@/components/ui/notification-toast";

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

/**
 * Legacy toast store — forwards all addToast calls to the v2
 * notification-toast store so a single ToastContainer renders them.
 */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = "info") => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const toast: Toast = { id, message, type, createdAt: Date.now() };

    set((state) => ({
      toasts: [...state.toasts, toast].slice(-5),
    }));

    // Forward to v2 notification-toast store (rendered in page.tsx)
    useNotificationStore.getState().addToast({
      type,
      title: message,
    });

    // Auto-dismiss from legacy store after 4 seconds
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

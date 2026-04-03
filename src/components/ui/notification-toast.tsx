"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Bell,
  X,
} from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "action-required";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  body?: string;
  actions?: ToastAction[];
}

// ---------------------------------------------------------------------------
// Zustand Store
// ---------------------------------------------------------------------------

interface ToastStore {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, "id">) => string;
  dismissToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${++toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    return id;
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;

const typeConfig: Record<
  ToastType,
  {
    icon: typeof Info;
    colorClass: string;
    bgClass: string;
    borderClass: string;
    glowClass?: string;
  }
> = {
  info: {
    icon: Info,
    colorClass: "text-accent",
    bgClass: "bg-accent-subtle",
    borderClass: "border-accent/20",
  },
  success: {
    icon: CheckCircle,
    colorClass: "text-success",
    bgClass: "bg-success-subtle",
    borderClass: "border-success/20",
  },
  warning: {
    icon: AlertTriangle,
    colorClass: "text-warning",
    bgClass: "bg-warning-subtle",
    borderClass: "border-warning/20",
  },
  error: {
    icon: XCircle,
    colorClass: "text-error",
    bgClass: "bg-error-subtle",
    borderClass: "border-error/20",
  },
  "action-required": {
    icon: Bell,
    colorClass: "text-accent",
    bgClass: "bg-accent-subtle",
    borderClass: "border-accent/20",
    glowClass: "shadow-accent-glow",
  },
};

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = typeConfig[toast.type];
  const Icon = config.icon;

  // Auto-dismiss (except action-required)
  useEffect(() => {
    if (toast.type === "action-required") return;
    timerRef.current = setTimeout(() => {
      onDismiss(toast.id);
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.type, onDismiss]);

  const handleDismiss = useCallback(() => {
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  return (
    <div
      role="alert"
      className={cn(
        "relative flex gap-3 p-3 rounded-lg",
        "w-[360px] max-w-[calc(100vw-32px)]",
        "glass border",
        "shadow-toast",
        "animate-slide-in-right",
        config.borderClass,
        config.glowClass,
      )}
    >
      {/* Icon */}
      <div className={cn("shrink-0 mt-0.5", config.colorClass)}>
        <Icon className="size-4" strokeWidth={1.75} />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <p className="text-body-sm text-text-emphasis font-medium leading-tight">
          {toast.title}
        </p>
        {toast.body && (
          <p className="text-label-xs text-text-secondary leading-relaxed">
            {toast.body}
          </p>
        )}

        {/* Action buttons */}
        {toast.actions && toast.actions.length > 0 && (
          <div className="flex items-center gap-2 mt-1">
            {toast.actions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className={cn(
                  "inline-flex items-center justify-center",
                  "px-2.5 py-1 rounded-md",
                  "text-label-xs font-medium",
                  "text-accent bg-accent-subtle",
                  "hover:bg-accent/15",
                  "transition-colors duration-[var(--duration-instant)] ease-out",
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className={cn(
          "shrink-0 flex items-center justify-center",
          "size-5 rounded",
          "text-text-tertiary hover:text-text-primary hover:bg-surface-hover",
          "transition-colors duration-[var(--duration-instant)] ease-out",
        )}
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast Container
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  // Only show the last MAX_VISIBLE toasts
  const visible = toasts.slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className={cn(
        "fixed top-4 right-4",
        "flex flex-col gap-2",
        "z-toast",
        "pointer-events-none",
      )}
    >
      {visible.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={dismissToast} />
        </div>
      ))}
    </div>
  );
}

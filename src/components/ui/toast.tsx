"use client";

import { X, CheckCircle, Warning, Info, XCircle } from "@phosphor-icons/react";
import { useToastStore, type Toast } from "@/stores/toast";
import { cn } from "@/lib/utils";

const iconMap: Record<Toast["type"], React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  error: XCircle,
};

const colorMap: Record<Toast["type"], string> = {
  info: "border-console-muted/30 text-console-muted",
  success: "border-console-success/30 text-console-success",
  warning: "border-console-accent/30 text-console-accent",
  error: "border-console-error/30 text-console-error",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = iconMap[toast.type];

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 rounded-lg border bg-console-panel shadow-lg",
        "animate-toast-in",
        colorMap[toast.type],
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span className="text-xs text-console-text flex-1 leading-relaxed">
        {toast.message}
      </span>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-0.5 text-console-dim hover:text-console-muted transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[100] flex flex-col gap-2 w-[320px] pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
}

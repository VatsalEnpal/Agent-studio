"use client";

import { CloseIcon, CheckCircleIcon, WarningIcon, InfoIcon, XCircleIcon } from "@/components/ui/icons";
import { useToastStore, type Toast } from "@/stores/toast";
import { cn } from "@/lib/utils";

const iconMap: Record<Toast["type"], React.ComponentType<{ className?: string }>> = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningIcon,
  error: XCircleIcon,
};

const colorMap: Record<Toast["type"], string> = {
  info: "border-text-secondary/30 text-text-secondary",
  success: "border-sessions/30 text-sessions",
  warning: "border-rooms/30 text-rooms",
  error: "border-error/30 text-error",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = iconMap[toast.type];

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 rounded border bg-bg-surface shadow-lg",
        "animate-toast-in",
        colorMap[toast.type],
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span className="text-xs text-text-primary flex-1 leading-relaxed">
        {toast.message}
      </span>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-0.5 text-text-tertiary hover:text-text-secondary transition-all shrink-0"
      >
        <CloseIcon className="w-3 h-3" />
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

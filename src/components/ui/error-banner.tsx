"use client";

import { useCallback } from "react";
import { WarningCircleIcon, CloseIcon, RefreshIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Error Banner — inline red banner with retry + dismiss
// ---------------------------------------------------------------------------

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  className,
}: ErrorBannerProps) {
  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg",
        "bg-error-subtle border border-error/20",
        "animate-fade-in",
        className,
      )}
    >
      <WarningCircleIcon
        size={16}
        className="text-error shrink-0"
      />

      <p className="flex-1 text-body-sm text-error min-w-0 truncate">
        {message}
      </p>

      {onRetry && (
        <button
          onClick={handleRetry}
          className={cn(
            "inline-flex items-center gap-1.5",
            "px-2.5 py-1 rounded-md",
            "text-label-xs font-medium",
            "text-error bg-error/10 hover:bg-error/15",
            "transition-all duration-[var(--duration-instant)] ease-out",
          )}
        >
          <RefreshIcon size={12} />
          Retry
        </button>
      )}

      {onDismiss && (
        <button
          onClick={handleDismiss}
          className={cn(
            "shrink-0 flex items-center justify-center",
            "size-5 rounded",
            "text-error/60 hover:text-error hover:bg-error/10",
            "transition-all duration-[var(--duration-instant)] ease-out",
          )}
          aria-label="Dismiss error"
        >
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}

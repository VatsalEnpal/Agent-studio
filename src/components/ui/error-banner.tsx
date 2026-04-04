"use client";

import { useCallback } from "react";
import { WarningCircle, X, ArrowClockwise } from "@phosphor-icons/react";
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
      <WarningCircle
        size={16}
        weight="light"
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
            "transition-colors duration-[var(--duration-instant)] ease-out",
          )}
        >
          <ArrowClockwise size={12} weight="light" />
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
            "transition-colors duration-[var(--duration-instant)] ease-out",
          )}
          aria-label="Dismiss error"
        >
          <X size={14} weight="light" />
        </button>
      )}
    </div>
  );
}

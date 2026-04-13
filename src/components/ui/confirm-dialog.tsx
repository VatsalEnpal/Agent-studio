"use client";

import { useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon, WarningIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Optional secondary line (e.g. item name) */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = useCallback(() => {
    if (loading) return;
    onConfirm();
  }, [loading, onConfirm]);

  const isDanger = variant === "danger";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[380px] bg-bg-elevated border border-border-subtle rounded shadow-modal animate-slide-up">
          <Dialog.Description className="sr-only">Confirm action</Dialog.Description>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <Dialog.Title
              className={cn(
                "text-xs font-medium flex items-center gap-1.5",
                isDanger ? "text-error" : "text-sprints",
              )}
            >
              <WarningIcon size={14} />
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded text-text-ghost hover:text-text-primary hover:bg-bg-input transition-all">
                <CloseIcon size={14} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="px-4 py-4">
            <p className="text-xs text-text-primary leading-relaxed">{description}</p>
            {detail && (
              <p className="text-label text-text-secondary mt-2 font-medium truncate">
                &ldquo;{detail}&rdquo;
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
            <Dialog.Close asChild>
              <button className="px-3 py-1.5 text-label text-text-secondary hover:text-text-primary bg-bg-elevated rounded transition-all">
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={cn(
                "px-3 py-1.5 text-label font-medium rounded transition-all active:scale-[0.98]",
                "disabled:opacity-50 disabled:active:scale-100",
                "flex items-center gap-1.5",
                isDanger
                  ? "text-white bg-error/80 hover:bg-error"
                  : "text-black bg-sprints/80 hover:bg-sprints",
              )}
            >
              {loading && <span className="animate-spin text-xs">...</span>}
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

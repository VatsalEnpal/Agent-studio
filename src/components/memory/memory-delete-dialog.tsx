"use client";

import { useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon, TrashIcon } from "@/components/ui/icons";
import { useMemoryStore } from "@/stores/memory";
import { useToastStore } from "@/stores/toast";

export function MemoryDeleteDialog() {
  const open = useMemoryStore((s) => s.deleteDialogOpen);
  const close = useMemoryStore((s) => s.closeDeleteDialog);
  const entry = useMemoryStore((s) => s.editingEntry);
  const saving = useMemoryStore((s) => s.saving);
  const setSaving = useMemoryStore((s) => s.setSaving);
  const removeEntry = useMemoryStore((s) => s.removeEntry);
  const addToast = useToastStore((s) => s.addToast);

  const handleDelete = useCallback(async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/memory/entries/${encodeURIComponent(entry.file)}`, {
        method: "DELETE",
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed to delete");
      removeEntry(entry.file);
      addToast("Memory deleted", "success");
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addToast(`Error: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  }, [entry, removeEntry, addToast, close, setSaving]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[400px] bg-bg-elevated border border-border-subtle rounded-lg shadow-modal">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <Dialog.Title className="text-xs font-medium text-error flex items-center gap-1.5">
              <TrashIcon size={14} />
              Delete Memory
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded-md text-text-ghost hover:text-text-primary hover:bg-bg-input transition-all">
                <CloseIcon size={14} />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-4 py-4">
            <p className="text-xs text-text-primary leading-relaxed">
              Are you sure you want to delete this memory?
            </p>
            {entry && (
              <p className="text-label text-text-secondary mt-2 font-medium truncate">
                &ldquo;{entry.title}&rdquo;
              </p>
            )}
            <p className="text-label text-text-ghost mt-2">
              This action cannot be undone. The memory file and its index entry will be permanently removed.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
            <button
              onClick={close}
              className="px-3 py-1.5 text-label text-text-secondary hover:text-text-primary bg-bg-elevated rounded transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-3 py-1.5 text-label font-medium text-white bg-error/80 rounded hover:bg-error active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center gap-1.5"
            >
              {saving && <span className="animate-spin text-[10px]">...</span>}
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

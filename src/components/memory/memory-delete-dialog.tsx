"use client";

import { useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, Trash2 } from "lucide-react";
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
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[400px] bg-console-panel border border-console-border rounded-lg shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-console-border">
            <Dialog.Title className="text-xs font-medium text-console-error flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              Delete Memory
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 text-console-dim hover:text-console-text transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-4 py-4">
            <p className="text-xs text-console-text leading-relaxed">
              Are you sure you want to delete this memory?
            </p>
            {entry && (
              <p className="text-[10px] text-console-muted mt-2 font-medium truncate">
                &ldquo;{entry.title}&rdquo;
              </p>
            )}
            <p className="text-[9px] text-console-dim mt-2">
              This action cannot be undone. The memory file and its index entry will be permanently removed.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-console-border">
            <button
              onClick={close}
              className="px-3 py-1.5 text-[10px] text-console-muted hover:text-console-text bg-console-faint rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-3 py-1.5 text-[10px] font-medium text-white bg-console-error/80 rounded hover:bg-console-error transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

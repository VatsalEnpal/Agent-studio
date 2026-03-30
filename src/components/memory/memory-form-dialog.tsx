"use client";

import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, Tag as TagIcon } from "lucide-react";
import { useMemoryStore, type MemoryFormData, type MemoryEntryDetail } from "@/stores/memory";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "learnings", label: "Learning" },
  { value: "corrections", label: "Correction" },
  { value: "decisions", label: "Decision" },
  { value: "knowledge", label: "Knowledge" },
  { value: "human-inputs", label: "Human Input" },
];

const FIELD_HINTS: Record<string, string> = {
  observation: "What did you notice or encounter?",
  action: "What was done about it?",
  outcome: "What happened as a result?",
  lesson: "What should be remembered for next time?",
};

function emptyForm(): MemoryFormData {
  return {
    title: "",
    category: "learnings",
    content: { observation: "", action: "", outcome: "", lesson: "" },
    tags: [],
    pinned: false,
  };
}

export function MemoryFormDialog({ mode }: { mode: "create" | "edit" }) {
  const isCreate = mode === "create";
  const open = useMemoryStore((s) => isCreate ? s.createDialogOpen : s.editDialogOpen);
  const close = useMemoryStore((s) => isCreate ? s.closeCreateDialog : s.closeEditDialog);
  const editingEntry = useMemoryStore((s) => s.editingEntry);
  const saving = useMemoryStore((s) => s.saving);
  const setSaving = useMemoryStore((s) => s.setSaving);
  const addEntry = useMemoryStore((s) => s.addEntry);
  const updateEntry = useMemoryStore((s) => s.updateEntry);
  const addToast = useToastStore((s) => s.addToast);

  const [form, setForm] = useState<MemoryFormData>(emptyForm());
  const [tagInput, setTagInput] = useState("");

  // Pre-fill form when editing
  useEffect(() => {
    if (mode === "edit" && editingEntry && open) {
      // Load the full detail to get content
      fetch(`/api/memory/entry?file=${encodeURIComponent(editingEntry.file)}`)
        .then((r) => r.json())
        .then((detail: MemoryEntryDetail) => {
          setForm({
            title: detail.title ?? editingEntry.title,
            category: editingEntry.category,
            content: {
              observation: (detail.content?.observation as string) ?? "",
              action: (detail.content?.action as string) ?? "",
              outcome: (detail.content?.outcome as string) ?? "",
              lesson: (detail.content?.lesson as string) ?? "",
            },
            tags: detail.tags ?? editingEntry.tags,
            pinned: detail.pinned ?? editingEntry.pinned ?? false,
          });
          setTagInput("");
        })
        .catch(() => {
          setForm({
            title: editingEntry.title,
            category: editingEntry.category,
            content: { observation: "", action: "", outcome: "", lesson: "" },
            tags: editingEntry.tags,
            pinned: editingEntry.pinned ?? false,
          });
        });
    } else if (isCreate && open) {
      setForm(emptyForm());
      setTagInput("");
    }
  }, [mode, editingEntry, open, isCreate]);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !form.tags.includes(trimmed)) {
      setForm((f) => ({ ...f, tags: [...f.tags, trimmed] }));
    }
    setTagInput("");
  }, [tagInput, form.tags]);

  const removeTag = useCallback((tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) {
      addToast("Title is required", "error");
      return;
    }
    setSaving(true);
    try {
      if (isCreate) {
        const res = await fetch("/api/memory/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json() as { ok?: boolean; file?: string; error?: string };
        if (!data.ok) throw new Error(data.error ?? "Failed to create");
        addEntry({
          file: data.file!,
          title: form.title,
          key_point: form.content.lesson || form.content.observation || form.title,
          tags: form.tags,
          category: form.category,
          agent_type: "dashboard",
          pinned: form.pinned,
        });
        addToast("Memory created", "success");
      } else if (editingEntry) {
        const res = await fetch(`/api/memory/entries/${encodeURIComponent(editingEntry.file)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!data.ok) throw new Error(data.error ?? "Failed to update");
        updateEntry(editingEntry.file, {
          title: form.title,
          key_point: form.content.lesson || form.content.observation || form.title,
          tags: form.tags,
          pinned: form.pinned,
        });
        addToast("Memory updated", "success");
      }
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      addToast(`Error: ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  }, [form, isCreate, editingEntry, addEntry, updateEntry, addToast, close, setSaving]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[560px] max-h-[85vh] overflow-y-auto bg-console-panel border border-console-border rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-console-border">
            <Dialog.Title className="text-xs font-medium text-console-text">
              {isCreate ? "Create Memory" : "Edit Memory"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 text-console-dim hover:text-console-text transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Title */}
            <div>
              <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Brief description of this memory"
                className="mt-1 w-full px-2.5 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent transition-colors"
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                disabled={!isCreate}
                className="mt-1 w-full px-2.5 py-1.5 text-xs bg-console-bg border border-console-border rounded text-console-text focus:outline-none focus:border-console-accent transition-colors disabled:opacity-50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Content fields */}
            {(["observation", "action", "outcome", "lesson"] as const).map((field) => (
              <div key={field}>
                <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </label>
                <p className="text-[8px] text-console-dim mt-0.5">{FIELD_HINTS[field]}</p>
                <textarea
                  value={form.content[field]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      content: { ...f.content, [field]: e.target.value },
                    }))
                  }
                  rows={2}
                  className={cn(
                    "mt-1 w-full px-2.5 py-1.5 text-xs bg-console-bg border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent transition-colors resize-none",
                    field === "lesson" ? "border-console-accent/30" : "border-console-border",
                  )}
                />
              </div>
            ))}

            {/* Tags */}
            <div>
              <label className="text-[9px] font-medium text-console-dim uppercase tracking-wider">Tags</label>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-console-faint text-console-muted rounded"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-console-dim hover:text-console-text">
                      <X className="w-2 h-2" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <TagIcon className="w-3 h-3 text-console-dim shrink-0" />
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add tag (Enter or comma to add)"
                  className="flex-1 px-2 py-1 text-[10px] bg-console-bg border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
                />
                <button
                  onClick={addTag}
                  className="text-[9px] px-2 py-1 bg-console-faint text-console-muted rounded hover:bg-console-border transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-console-border">
            <button
              onClick={close}
              className="px-3 py-1.5 text-[10px] text-console-muted hover:text-console-text bg-console-faint rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="px-3 py-1.5 text-[10px] font-medium text-console-bg bg-console-accent rounded hover:bg-console-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {isCreate ? "Create" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

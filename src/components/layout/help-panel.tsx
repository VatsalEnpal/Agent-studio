"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { HelpCircle, X, Monitor, Users, Keyboard } from "lucide-react";

export function HelpPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="flex items-center justify-center w-6 h-6 rounded text-console-muted hover:text-console-text hover:bg-console-faint/50 transition-all"
          title="Help"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[340px] bg-console-panel border border-console-border rounded-lg shadow-2xl focus:outline-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-console-border">
            <Dialog.Title className="text-sm font-semibold text-console-text">
              Quick Guide
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-console-muted hover:text-console-text transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Quick guide for Agent Studio</Dialog.Description>

          <div className="px-4 py-4 space-y-4">
            <div className="flex items-start gap-3">
              <Monitor className="w-4 h-4 text-console-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-console-text">Sessions</p>
                <p className="text-[11px] text-console-muted">Launch Claude Code terminals. Click + New Session.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-console-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-console-text">Teams</p>
                <p className="text-[11px] text-console-muted">Monitor agent sprints. Click steps to expand.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Keyboard className="w-4 h-4 text-console-accent shrink-0 mt-0.5" />
              <div className="flex items-center gap-3">
                <Shortcut keys="Cmd N" label="new session" />
                <Shortcut keys="Cmd K" label="search" />
                <Shortcut keys="Cmd \" label="sidebar" />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px]">
      <kbd className="px-1 py-0.5 rounded bg-console-border text-console-text font-mono text-[9px]">
        {keys}
      </kbd>
      <span className="text-console-muted">{label}</span>
    </span>
  );
}

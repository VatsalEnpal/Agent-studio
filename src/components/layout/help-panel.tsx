"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { HelpIcon, CloseIcon, SessionsIcon, UsersIcon, BrainIcon, ChartBarIcon, SettingsIcon, ExternalLinkIcon } from "@/components/ui/icons";

const HOWTO_URL =
  "https://github.com/VatsalEnpal/Agent-studio/blob/main/HOWTO.md";

export function HelpPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="flex items-center justify-center w-7 h-7 rounded text-text-secondary hover:text-text-primary hover:bg-white/10 transition-all"
          title="Help & Guide"
        >
          <HelpIcon className="w-4 h-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] bg-bg-elevated border border-border-subtle rounded shadow-modal focus:outline-none animate-cmd-palette-in">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              Help & Guide
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-text-secondary hover:text-text-primary transition-all">
                <CloseIcon className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Keyboard shortcuts, features, and guide for Agent Studio
          </Dialog.Description>

          <div className="px-5 py-4 space-y-4">
            {/* Shortcuts */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                Shortcuts
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <ShortcutRow keys="⌘⇧N" label="New session" />
                <ShortcutRow keys="⌘⇧K" label="Command palette" />
                <ShortcutRow keys="⌘⇧\" label="Toggle sidebar" />
                <ShortcutRow keys="⌘⇧1-6" label="Focus session" />
                <ShortcutRow keys="⌘⇧F" label="Fullscreen" />
                <ShortcutRow keys="Esc" label="Close dialogs" />
              </div>
            </div>

            <hr className="border-border-default" />

            {/* Features */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                Features
              </p>
              <div className="space-y-2">
                <FeatureRow
                  icon={<SessionsIcon className="w-3.5 h-3.5" />}
                  name="Sessions"
                  desc="Run multiple Claude Code terminals"
                />
                <FeatureRow
                  icon={<UsersIcon className="w-3.5 h-3.5" />}
                  name="Teams"
                  desc="Track agent workflows and sprints"
                />
                <FeatureRow
                  icon={<BrainIcon className="w-3.5 h-3.5" />}
                  name="Memory"
                  desc="Browse agent knowledge base"
                />
                <FeatureRow
                  icon={<ChartBarIcon className="w-3.5 h-3.5" />}
                  name="Reports"
                  desc="Review automation results"
                />
                <FeatureRow
                  icon={<SettingsIcon className="w-3.5 h-3.5" />}
                  name="Settings"
                  desc="Configure workspace, automations, theme"
                />
              </div>
            </div>

            <hr className="border-border-default" />

            {/* Guide link */}
            <a
              href={HOWTO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-rooms hover:underline"
            >
              <ExternalLinkIcon className="w-3.5 h-3.5" />
              Full How-To Guide
            </a>
          </div>

          {/* Version footer */}
          <div className="px-5 py-2 border-t border-border-default">
            <p className="text-xs text-text-secondary/60">
              Agent Studio v0.1.0
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="inline-flex items-center justify-center min-w-[44px] px-1.5 py-0.5 rounded bg-border-default text-text-primary font-mono text-xs leading-tight">
        {keys}
      </kbd>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}

function FeatureRow({
  icon,
  name,
  desc,
}: {
  icon: React.ReactNode;
  name: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-rooms shrink-0">{icon}</span>
      <span className="text-xs text-text-primary font-medium w-16 shrink-0">
        {name}
      </span>
      <span className="text-xs text-text-secondary">{desc}</span>
    </div>
  );
}

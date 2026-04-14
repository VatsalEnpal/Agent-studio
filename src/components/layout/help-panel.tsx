"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  HelpIcon,
  CloseIcon,
  SessionsIcon,
  UsersIcon,
  BrainIcon,
  SettingsIcon,
  ExternalLinkIcon,
} from "@/components/ui/icons";

const HOWTO_URL = "https://github.com/VatsalEnpal/Agent-studio/blob/main/HOWTO.md";

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

          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Getting Started */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                Getting Started
              </p>
              <div className="space-y-1.5 text-xs text-text-secondary">
                <StepRow
                  num="1"
                  text="Press Cmd+Shift+N to launch a session. Pick a preset or configure manually."
                />
                <StepRow
                  num="2"
                  text="Your terminal appears in the grid. Type commands or let the agent work."
                />
                <StepRow
                  num="3"
                  text="Use Teams tab to track sprint workflows across multiple agents."
                />
                <StepRow
                  num="4"
                  text="Sidebar shows git status, running processes, and past sessions."
                />
              </div>
            </div>

            <hr className="border-border-default" />

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
                  desc="Run up to 6 Claude Code terminals in a grid"
                />
                <FeatureRow
                  icon={<UsersIcon className="w-3.5 h-3.5" />}
                  name="Teams"
                  desc="Coordinate agent sprints with gated workflows"
                />
                <FeatureRow
                  icon={<BrainIcon className="w-3.5 h-3.5" />}
                  name="Memory"
                  desc="Search and browse agent knowledge entries"
                />
                <FeatureRow
                  icon={<SettingsIcon className="w-3.5 h-3.5" />}
                  name="Settings"
                  desc="Model defaults, permissions, system monitor"
                />
              </div>
            </div>

            <hr className="border-border-default" />

            {/* Tips */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2">
                Tips
              </p>
              <div className="space-y-1.5 text-xs text-text-secondary">
                <p>Use Quick Start presets in the launcher for one-click sessions.</p>
                <p>Click any session in the sidebar to switch focus instantly.</p>
                <p>Cmd+Shift+K opens the command palette for fast navigation.</p>
                <p>Expand sprint steps to see gate checks, handoffs, and agent notes.</p>
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
            <p className="text-xs text-text-secondary/60">Agent Studio v0.1.0</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StepRow({ num, text }: { num: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-rooms font-mono text-xs font-medium shrink-0 mt-px">{num}.</span>
      <span>{text}</span>
    </div>
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

function FeatureRow({ icon, name, desc }: { icon: React.ReactNode; name: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-rooms shrink-0">{icon}</span>
      <span className="text-xs text-text-primary font-medium w-16 shrink-0">{name}</span>
      <span className="text-xs text-text-secondary">{desc}</span>
    </div>
  );
}

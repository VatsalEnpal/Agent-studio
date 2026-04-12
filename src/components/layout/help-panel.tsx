"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  HelpCircle,
  X,
  Terminal,
  Users,
  Brain,
  FileBarChart,
  Settings,
  ExternalLink,
} from "lucide-react";

export function HelpPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="flex items-center justify-center w-7 h-7 rounded-md text-console-muted hover:text-console-text hover:bg-white/10 transition-all"
          title="Help & Guide"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] bg-console-panel border border-console-border rounded shadow-2xl focus:outline-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-5 py-3 border-b border-console-border">
            <Dialog.Title className="text-sm font-semibold text-console-text">
              Help & Guide
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-console-muted hover:text-console-text transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Keyboard shortcuts, features, and guide for Agent Studio
          </Dialog.Description>

          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Getting Started */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-console-muted mb-2">
                Getting Started
              </p>
              <div className="space-y-1.5 text-[11px] text-console-muted">
                <StepRow
                  num="1"
                  text="Press Cmd+N to launch a session. Pick a preset or configure manually."
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

            <hr className="border-console-border" />

            {/* Shortcuts */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-console-muted mb-2">
                Shortcuts
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <ShortcutRow keys="⌘N" label="New session" />
                <ShortcutRow keys="⌘K" label="Command palette" />
                <ShortcutRow keys="⌘\" label="Toggle sidebar" />
                <ShortcutRow keys="⌘⇧1-6" label="Focus session" />
                <ShortcutRow keys="⌘⇧F" label="Fullscreen" />
                <ShortcutRow keys="Esc" label="Close dialogs" />
              </div>
            </div>

            <hr className="border-console-border" />

            {/* Features */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-console-muted mb-2">
                Features
              </p>
              <div className="space-y-2">
                <FeatureRow
                  icon={<Terminal className="w-3.5 h-3.5" />}
                  name="Sessions"
                  desc="Run up to 6 Claude Code terminals in a grid"
                />
                <FeatureRow
                  icon={<Users className="w-3.5 h-3.5" />}
                  name="Teams"
                  desc="Coordinate agent sprints with gated workflows"
                />
                <FeatureRow
                  icon={<Brain className="w-3.5 h-3.5" />}
                  name="Memory"
                  desc="Search and browse agent knowledge entries"
                />
                <FeatureRow
                  icon={<FileBarChart className="w-3.5 h-3.5" />}
                  name="Reports"
                  desc="View sprint results, QA health, and handoffs"
                />
                <FeatureRow
                  icon={<Settings className="w-3.5 h-3.5" />}
                  name="Settings"
                  desc="Model defaults, permissions, system monitor"
                />
              </div>
            </div>

            <hr className="border-console-border" />

            {/* Tips */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-console-muted mb-2">
                Tips
              </p>
              <div className="space-y-1.5 text-[11px] text-console-muted">
                <p>
                  Use Quick Start presets in the launcher for one-click
                  sessions.
                </p>
                <p>
                  Click any session in the sidebar to switch focus instantly.
                </p>
                <p>Cmd+K opens the command palette for fast navigation.</p>
                <p>
                  Expand sprint steps to see gate checks, handoffs, and agent
                  notes.
                </p>
              </div>
            </div>

            <hr className="border-console-border" />

            {/* Guide link */}
            <p className="text-xs text-console-muted">
              Full guide:{" "}
              <span className="text-console-text font-medium">HOWTO.md</span> in
              the project root.
            </p>
          </div>

          {/* Version footer */}
          <div className="px-5 py-2 border-t border-console-border">
            <p className="text-[10px] text-console-muted/60">
              Agent Studio v0.1.0
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StepRow({ num, text }: { num: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-console-accent font-mono text-[10px] font-medium shrink-0 mt-px">
        {num}.
      </span>
      <span>{text}</span>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="inline-flex items-center justify-center min-w-[44px] px-1.5 py-0.5 rounded bg-console-border/60 text-console-text font-mono text-[10px] leading-tight">
        {keys}
      </kbd>
      <span className="text-[11px] text-console-muted">{label}</span>
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
      <span className="text-console-accent shrink-0">{icon}</span>
      <span className="text-xs text-console-text font-medium w-16 shrink-0">
        {name}
      </span>
      <span className="text-[11px] text-console-muted">{desc}</span>
    </div>
  );
}

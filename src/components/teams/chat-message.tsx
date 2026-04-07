"use client";

import type React from "react";
import { lazy, Suspense, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { CheckIcon, CloseIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon } from "@/components/ui/icons";
import type { RoomMessage } from "@/stores/rooms";

/** Code block with copy button overlay */
function CopyableCodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Extract plain text from children
    const el = document.createElement("div");
    // Render the children text content
    const codeText = extractText(children);
    void navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="relative group/code">
      <pre {...props}>{children}</pre>
      <button
        onClick={handleCopy}
        className={cn(
          "absolute top-1.5 right-1.5 p-1 rounded",
          "opacity-0 group-hover/code:opacity-100 transition-opacity duration-150",
          "bg-bg-surface border border-border-subtle",
          "text-text-tertiary hover:text-text-primary",
        )}
        title="Copy code"
      >
        {copied ? <CheckIcon size={12} className="text-sessions" /> : <CopyIcon size={12} />}
      </button>
    </div>
  );
}

/** Recursively extract text from React children */
function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as React.ReactElement).props as Record<string, unknown>;
    return extractText(props.children as React.ReactNode);
  }
  return "";
}

const Markdown = lazy(() => import("react-markdown"));

// remark-gfm is a plugin function, not a React component — cannot use React.lazy()
// Load it dynamically via a module-level promise instead
let _remarkGfm: any = null;
const _remarkGfmPromise = import("remark-gfm").then((m) => {
  _remarkGfm = m.default;
});

export interface ChatMessageProps {
  msg: RoomMessage;
  grouped?: boolean; // consecutive message from same agent within 2min
  onApprove: (msg: RoomMessage) => void;
  onReject: (msg: RoomMessage) => void;
  /** UX #6: Click agent name to navigate to their session */
  onAgentClick?: (agentId: string) => void;
}

function MessageContent({ text, isSystem }: { text: string; isSystem: boolean }) {
  const [gfmReady, setGfmReady] = useState(!!_remarkGfm);

  useEffect(() => {
    if (!_remarkGfm) {
      _remarkGfmPromise.then(() => setGfmReady(true));
    }
  }, []);

  if (isSystem) {
    return <span className="text-text-tertiary italic text-label">{text}</span>;
  }

  // Strip ANSI escape codes and terminal artifacts from agent messages (legacy PTY rooms)
  const cleanText = text
    // Standard ANSI escape sequences
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
    // OSC sequences (title set, etc.)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, "")
    // Private mode sequences
    .replace(/\x1B\[[\?]?[0-9;]*[a-zA-Z]/g, "")
    // DEC sequences like [>0q
    .replace(/\[>[0-9]+[a-z]/g, "")
    // Remaining raw escape chars
    .replace(/\x1B/g, "")
    // Terminal spinner characters and control chars
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Claude Code UI artifacts (spinners, remote-control banner)
    .replace(/[✢⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●]/g, "")
    // Collapse multiple spaces/newlines
    .replace(/ {3,}/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // For short messages without markdown syntax, render as plain text
  const hasMarkdown = /[*_`#\[\]|>-]/.test(cleanText) && cleanText.length > 40;
  if (!hasMarkdown) {
    return <span className="text-xs leading-relaxed">{highlightMentions(cleanText)}</span>;
  }

  const plugins = gfmReady && _remarkGfm ? [_remarkGfm] : [];

  return (
    <Suspense fallback={<span className="text-xs leading-relaxed">{cleanText}</span>}>
      <div className="text-xs leading-relaxed prose prose-invert prose-sm max-w-none
        prose-p:my-1 prose-pre:my-2
        prose-code:text-rooms prose-code:bg-bg-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:text-xs prose-code:font-mono
        prose-pre:bg-bg-elevated prose-pre:border prose-pre:border-border-subtle prose-pre:rounded-md
        prose-headings:text-text-primary prose-headings:mt-3 prose-headings:mb-1
        prose-a:text-rooms prose-a:no-underline hover:prose-a:underline
        prose-strong:text-text-primary
        prose-li:my-0.5
        prose-blockquote:border-rooms/30 prose-blockquote:text-text-secondary">
        <Markdown
          remarkPlugins={plugins}
          components={{
            pre: ({ children, ...props }) => (
              <CopyableCodeBlock {...props}>{children}</CopyableCodeBlock>
            ),
          }}
        >
          {cleanText}
        </Markdown>
      </div>
    </Suspense>
  );
}

export function ChatMessage({ msg, grouped, onApprove, onReject, onAgentClick }: ChatMessageProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isUser = msg.from === "user";
  const isSystem = msg.type === "system";
  const isApproval = msg.type === "approval-request";

  const color = isUser ? "var(--accent-rooms)" : agentColor(msg.from);
  const liveTimestamp = useRelativeTime(msg.timestamp);

  // -------------------------------------------------------------------------
  // System messages — centered divider with text (Slack style)
  // -------------------------------------------------------------------------
  if (isSystem) {
    return (
      <div className="flex items-center gap-3 py-3 px-6">
        <div className="flex-1 h-px bg-border-subtle" />
        <span className="text-label text-text-tertiary shrink-0 max-w-sm text-center">
          {msg.text}
        </span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // User messages — right-aligned bubble (iMessage style)
  // -------------------------------------------------------------------------
  if (isUser) {
    return (
      <div className={cn("px-5 group/msg", grouped ? "pt-0.5 pb-0.5" : "pt-3 pb-1")}>
        <div className="flex justify-end gap-3">
          <div className="max-w-[70%]">
            {/* Name + timestamp (timestamp shows on hover like Slack) */}
            {!grouped && (
              <div className="flex items-center justify-end gap-2 mb-1">
                <span className="text-label text-text-tertiary shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150">
                  {liveTimestamp}
                </span>
                <span className="text-xs font-semibold text-rooms">
                  You
                </span>
              </div>
            )}
            {/* Message bubble */}
            <div className="rounded-xl rounded-tr-sm bg-rooms/15 border border-rooms/20 px-3.5 py-2 text-text-primary">
              <MessageContent text={msg.text ?? ""} isSystem={false} />
            </div>
          </div>
          {/* Avatar */}
          <div className="w-6 shrink-0">
            {!grouped && (
              <div
                className="w-6 h-6 rounded-[4px] flex items-center justify-center"
                style={{ backgroundColor: color + "18", border: `1.5px solid ${color}30` }}
              >
                <span className="text-xs font-semibold leading-none" style={{ color }}>
                  Y
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Agent messages — left-aligned bubble (Slack style)
  // Approval requests get amber highlight
  // -------------------------------------------------------------------------
  return (
    <div
      className={cn(
        "px-5 group/msg transition-all duration-100",
        grouped ? "pt-0.5 pb-0.5" : "pt-3 pb-1",
        isApproval && msg.approvalStatus === "pending" && "bg-sprints/[0.04]",
        isApproval && msg.approvalStatus === "approved" && "bg-sessions/[0.04]",
        isApproval && msg.approvalStatus === "rejected" && "bg-error/[0.04]",
      )}
    >
      <div className="flex gap-3 max-w-[85%]">
        {/* Avatar — 36px rounded-[5px], only for non-grouped */}
        <div className="w-6 shrink-0">
          {!grouped && (
            <div
              className="w-6 h-6 rounded-[4px] flex items-center justify-center"
              style={{ backgroundColor: color + "18", border: `1.5px solid ${color}30` }}
            >
              <span
                className="text-xs font-semibold leading-none"
                style={{ color }}
              >
                {msg.from.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + timestamp (Slack layout: name bold left, timestamp gray right) */}
          {!grouped && (
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className={cn(
                  "text-xs font-semibold",
                  onAgentClick && "cursor-pointer hover:underline",
                )}
                style={{ color }}
                onClick={onAgentClick ? (e) => { e.stopPropagation(); onAgentClick(msg.from); } : undefined}
                title={onAgentClick ? "View session" : undefined}
              >
                {msg.from}
              </span>
              {msg.to && (
                <span className="text-label text-text-tertiary">
                  &rarr; {msg.to}
                </span>
              )}
              <span className="text-label text-text-tertiary ml-auto shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150">
                {liveTimestamp}
              </span>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={cn(
              "rounded-xl rounded-tl-sm px-3.5 py-2",
              isApproval && msg.approvalStatus === "pending"
                ? "bg-sprints/10 border border-sprints/20"
                : "bg-bg-elevated border border-border-subtle",
            )}
          >
            <MessageContent text={msg.text ?? ""} isSystem={false} />

            {/* Approval buttons */}
            {isApproval && msg.approvalStatus === "pending" && (
              <div className="flex gap-1.5 mt-2 pt-1.5 border-t border-sprints/15">
                <button
                  onClick={() => onApprove(msg)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-sessions/15 text-sessions rounded-md hover:bg-sessions/25 active:scale-[0.98] transition-all duration-100"
                >
                  <CheckIcon size={12} />
                  Approve
                </button>
                <button
                  onClick={() => onReject(msg)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-error/15 text-error rounded-md hover:bg-error/25 active:scale-[0.98] transition-all duration-100"
                >
                  <CloseIcon size={12} />
                  Reject
                </button>
              </div>
            )}
            {isApproval && msg.approvalStatus === "approved" && (
              <div className="flex items-center gap-1 mt-1.5 text-label text-sessions">
                <CheckIcon size={12} />
                Approved
              </div>
            )}
            {isApproval && msg.approvalStatus === "rejected" && (
              <div className="flex items-center gap-1 mt-1.5 text-label text-error">
                <CloseIcon size={12} />
                Rejected
              </div>
            )}
          </div>

          {/* Expandable detail panel (for agent messages) */}
          {msg.type === "message" && (
            <button
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex items-center gap-1 mt-1 text-label text-text-tertiary hover:text-text-secondary transition-all duration-100"
            >
              {detailsOpen ? (
                <ChevronDownIcon size={12} />
              ) : (
                <ChevronRightIcon size={12} />
              )}
              Details
            </button>
          )}

          {detailsOpen && (
            <div className="mt-1.5 p-2.5 rounded-lg bg-bg-elevated border border-border-subtle text-label text-text-secondary space-y-1.5 animate-slide-up">
              <div className="flex items-center gap-1.5">
                <span className="text-text-tertiary">Time:</span>
                <span>{formatTimestamp(msg.timestamp)}</span>
              </div>
              {msg.actionCommand && (
                <div className="flex items-center gap-1.5">
                  <span className="text-text-tertiary">Tool:</span>
                  <span className="font-mono">{msg.actionCommand}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-text-tertiary">ID:</span>
                <span className="font-mono">{msg.id.slice(0, 12)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Streaming ghost message (shown while agent is typing) ---
export function StreamingMessage({ agentId, text }: { agentId: string; text: string }) {
  const color = agentColor(agentId);

  if (!text) {
    // Typing indicator — no text yet
    return (
      <div className="px-5 pt-3 pb-1">
        <div className="flex gap-3">
          <div
            className="w-6 h-6 rounded-[4px] flex items-center justify-center shrink-0 animate-pulse-dot"
            style={{ backgroundColor: color + "18", border: `1.5px solid ${color}30` }}
          >
            <span className="text-xs font-semibold leading-none" style={{ color }}>
              {agentId.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-semibold" style={{ color }}>
                {agentId}
              </span>
              <span className="text-label text-text-tertiary italic">
                is thinking...
              </span>
            </div>
            <div className="flex gap-1.5 py-1">
              <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Streaming text — show accumulated markdown with pulsing cursor
  return (
    <div className="px-5 pt-3 pb-1">
      <div className="flex gap-3 max-w-[85%]">
        <div
          className="w-6 h-6 rounded-[4px] flex items-center justify-center shrink-0"
          style={{ backgroundColor: color + "18", border: `1.5px solid ${color}30` }}
        >
          <span className="text-xs font-semibold leading-none animate-pulse-dot" style={{ color }}>
            {agentId.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-semibold" style={{ color }}>
              {agentId}
            </span>
            <span className="text-label text-text-tertiary italic">typing...</span>
          </div>
          <div className="rounded-xl rounded-tl-sm bg-bg-elevated border border-border-subtle px-3.5 py-2">
            <MessageContent text={text} isSystem={false} />
            <span className="inline-block w-1.5 h-4 bg-rooms/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function highlightMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-rooms font-semibold">{part}</span>
    ) : (
      part
    ),
  );
}

function formatTimestamp(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

"use client";

import type React from "react";
import { lazy, Suspense, useState } from "react";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import { Check, X, ChevronDown, ChevronRight, Clock, FileCode, Wrench } from "lucide-react";
import type { RoomMessage } from "@/stores/rooms";

const Markdown = lazy(() => import("react-markdown"));
const remarkGfm = lazy(() => import("remark-gfm").then((m) => ({ default: m.default })));

export interface ChatMessageProps {
  msg: RoomMessage;
  grouped?: boolean; // consecutive message from same agent within 2min
  onApprove: (msg: RoomMessage) => void;
  onReject: (msg: RoomMessage) => void;
}

function MessageContent({ text, isSystem }: { text: string; isSystem: boolean }) {
  if (isSystem) {
    return <span className="text-text-tertiary italic text-body-sm">{text}</span>;
  }

  // For short messages without markdown syntax, render as plain text
  const hasMarkdown = /[*_`#\[\]|>-]/.test(text) && text.length > 40;
  if (!hasMarkdown) {
    return <span className="text-text-primary text-body">{highlightMentions(text)}</span>;
  }

  return (
    <Suspense fallback={<span className="text-text-primary text-body">{text}</span>}>
      <div className="text-text-primary text-body prose prose-invert prose-sm max-w-none
        prose-p:my-1 prose-pre:my-2
        prose-code:text-accent prose-code:bg-elevation-2 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:text-body-sm prose-code:font-mono
        prose-pre:bg-elevation-2 prose-pre:border prose-pre:border-border-subtle prose-pre:rounded-md
        prose-headings:text-text-emphasis prose-headings:mt-3 prose-headings:mb-1
        prose-a:text-accent prose-a:no-underline hover:prose-a:underline
        prose-strong:text-text-emphasis
        prose-li:my-0.5
        prose-blockquote:border-accent/30 prose-blockquote:text-text-secondary">
        <Markdown remarkPlugins={[remarkGfm as any]}>
          {text}
        </Markdown>
      </div>
    </Suspense>
  );
}

export function ChatMessage({ msg, grouped, onApprove, onReject }: ChatMessageProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isUser = msg.from === "user";
  const isSystem = msg.type === "system";
  const isApproval = msg.type === "approval-request";

  const color = isUser ? "#4F8FF7" : agentColor(msg.from);

  // System messages: centered, smaller, gray
  if (isSystem) {
    return (
      <div className="flex justify-center py-2 px-4">
        <div className="text-label-xs text-text-tertiary text-center max-w-md">
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "px-4 transition-colors duration-[100ms]",
        grouped ? "pt-0.5 pb-1.5" : "pt-3 pb-1.5",
        isUser && "bg-accent-subtle/50",
        isApproval && msg.approvalStatus === "pending" && "bg-warning-subtle shadow-accent-glow",
        isApproval && msg.approvalStatus === "approved" && "bg-success-subtle/50",
        isApproval && msg.approvalStatus === "rejected" && "bg-error-subtle/50",
      )}
    >
      <div className="flex gap-3">
        {/* Avatar — only show for non-grouped messages */}
        <div className="w-8 shrink-0">
          {!grouped && (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: color + "20", border: `1.5px solid ${color}40` }}
            >
              <span
                className="text-xs font-semibold leading-none"
                style={{ color }}
              >
                {isUser ? "Y" : msg.from.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + timestamp — only for non-grouped */}
          {!grouped && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-body-sm font-semibold"
                style={{ color }}
              >
                {isUser ? "You" : msg.from}
              </span>
              {msg.to && (
                <span className="text-label-xs text-text-tertiary">
                  &rarr; {msg.to}
                </span>
              )}
              <span className="text-label-xs text-text-tertiary ml-auto shrink-0">
                {formatTimestamp(msg.timestamp)}
              </span>
            </div>
          )}

          {/* Message body */}
          <MessageContent text={msg.text ?? ""} isSystem={false} />

          {/* Approval buttons */}
          {isApproval && msg.approvalStatus === "pending" && (
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => onApprove(msg)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-label font-medium bg-success/15 text-success rounded-md hover:bg-success/25 transition-colors duration-[100ms] shadow-[0_0_12px_rgba(52,211,153,0.15)]"
              >
                <Check className="w-3.5 h-3.5" />
                Approve
              </button>
              <button
                onClick={() => onReject(msg)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-label font-medium bg-error/15 text-error rounded-md hover:bg-error/25 transition-colors duration-[100ms]"
              >
                <X className="w-3.5 h-3.5" />
                Reject
              </button>
            </div>
          )}
          {isApproval && msg.approvalStatus === "approved" && (
            <div className="flex items-center gap-1 mt-1.5 text-label-xs text-success">
              <Check className="w-3 h-3" />
              Approved
            </div>
          )}
          {isApproval && msg.approvalStatus === "rejected" && (
            <div className="flex items-center gap-1 mt-1.5 text-label-xs text-error">
              <X className="w-3 h-3" />
              Rejected
            </div>
          )}

          {/* Expandable detail panel (for agent messages) */}
          {!isUser && msg.type === "message" && (
            <button
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex items-center gap-1 mt-1.5 text-label-xs text-text-tertiary hover:text-text-secondary transition-colors duration-[100ms]"
            >
              {detailsOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Details
            </button>
          )}

          {detailsOpen && (
            <div className="mt-2 p-2.5 rounded-md bg-elevation-2 border border-border-subtle text-label-xs text-text-secondary space-y-1.5 animate-slide-up">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-text-tertiary" />
                <span>{formatTimestamp(msg.timestamp)}</span>
              </div>
              {msg.actionCommand && (
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-text-tertiary" />
                  <span className="font-mono">{msg.actionCommand}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <FileCode className="w-3 h-3 text-text-tertiary" />
                <span>Message ID: {msg.id.slice(0, 12)}</span>
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
      <div className="px-4 pt-3 pb-1.5">
        <div className="flex gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 animate-pulse-dot"
            style={{ backgroundColor: color + "20", border: `1.5px solid ${color}40` }}
          >
            <span className="text-xs font-semibold leading-none" style={{ color }}>
              {agentId.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-body-sm font-semibold" style={{ color }}>
                {agentId}
              </span>
              <span className="text-label-xs text-text-tertiary italic">
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
    <div className="px-4 pt-3 pb-1.5 bg-accent-subtle/30">
      <div className="flex gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: color + "20", border: `1.5px solid ${color}40` }}
        >
          <span className="text-xs font-semibold leading-none animate-pulse-dot" style={{ color }}>
            {agentId.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-body-sm font-semibold" style={{ color }}>
              {agentId}
            </span>
            <span className="text-label-xs text-text-tertiary italic">typing...</span>
          </div>
          <MessageContent text={text} isSystem={false} />
          <span className="inline-block w-1.5 h-4 bg-accent/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        </div>
      </div>
    </div>
  );
}

function highlightMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-accent font-semibold">{part}</span>
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

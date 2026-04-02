"use client";

import type React from "react";
import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Bot, User, AlertTriangle, Info, Check, X } from "lucide-react";
import type { RoomMessage } from "@/stores/rooms";

const Markdown = lazy(() => import("react-markdown"));
const remarkGfm = lazy(() => import("remark-gfm").then((m) => ({ default: m.default })));

interface ChatMessageProps {
  msg: RoomMessage;
  onApprove: (msg: RoomMessage) => void;
  onReject: (msg: RoomMessage) => void;
}

const AGENT_COLORS: Record<string, string> = {
  orchestrator: "text-purple-400",
  "frontend-worker": "text-blue-400",
  frontend: "text-blue-400",
  "backend-worker": "text-green-400",
  backend: "text-green-400",
  "qa-tester": "text-yellow-400",
  qa: "text-yellow-400",
  "security-reviewer": "text-red-400",
  security: "text-red-400",
  pmo: "text-orange-400",
};

function MessageContent({ text, isSystem }: { text: string; isSystem: boolean }) {
  if (isSystem) {
    return <span className="text-console-dim italic">{text}</span>;
  }

  // For short messages without markdown syntax, render as plain text
  const hasMarkdown = /[*_`#\[\]|>-]/.test(text) && text.length > 40;
  if (!hasMarkdown) {
    return <span className="text-console-text">{highlightMentions(text)}</span>;
  }

  return (
    <Suspense fallback={<span className="text-console-text">{text}</span>}>
      <div className="text-console-text prose prose-invert prose-sm max-w-none
        prose-p:my-1 prose-pre:my-2 prose-code:text-console-accent prose-code:bg-console-faint
        prose-code:px-1 prose-code:rounded prose-headings:text-console-text prose-headings:mt-3 prose-headings:mb-1
        prose-a:text-console-accent prose-strong:text-console-text">
        <Markdown remarkPlugins={[remarkGfm as any]}>
          {text}
        </Markdown>
      </div>
    </Suspense>
  );
}

export function ChatMessage({ msg, onApprove, onReject }: ChatMessageProps) {
  const isUser = msg.from === "user";
  const isSystem = msg.from === "system";
  const isApproval = msg.type === "approval-request";

  const agentColor = AGENT_COLORS[msg.from] ?? "text-console-muted";

  return (
    <div
      className={cn(
        "px-4 py-2.5 transition-colors",
        isUser && "bg-console-elevated/20",
        isApproval && msg.approvalStatus === "pending" && "bg-amber-400/5 border-l-2 border-amber-400/50",
        isApproval && msg.approvalStatus === "approved" && "bg-green-400/5 border-l-2 border-green-400/30",
        isApproval && msg.approvalStatus === "rejected" && "bg-red-400/5 border-l-2 border-red-400/30",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {isUser ? (
          <User className="w-3 h-3 text-console-accent shrink-0" />
        ) : isSystem ? (
          <Info className="w-3 h-3 text-console-dim shrink-0" />
        ) : isApproval ? (
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
        ) : (
          <Bot className="w-3 h-3 text-console-muted shrink-0" />
        )}

        <span
          className={cn(
            "text-[11px] font-semibold font-mono",
            isUser ? "text-console-accent" : isSystem ? "text-console-dim" : agentColor,
          )}
        >
          {isUser ? "You" : msg.from}
        </span>

        {msg.to && (
          <span className="text-[9px] text-console-dim font-mono">
            &rarr; {msg.to}
          </span>
        )}

        <span className="text-[9px] text-console-dim ml-auto font-mono shrink-0">
          {formatRelativeTime(msg.timestamp)}
        </span>
      </div>

      <div className="pl-5">
        <MessageContent text={msg.text ?? ""} isSystem={isSystem} />
      </div>

      {isApproval && msg.approvalStatus === "pending" && (
        <div className="flex gap-2 mt-2 pl-5">
          <button
            onClick={() => onApprove(msg)}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={() => onReject(msg)}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}
      {isApproval && msg.approvalStatus === "approved" && (
        <span className="text-[9px] text-green-400 mt-1 block pl-5 font-mono">Approved</span>
      )}
      {isApproval && msg.approvalStatus === "rejected" && (
        <span className="text-[9px] text-red-400 mt-1 block pl-5 font-mono">Rejected</span>
      )}
    </div>
  );
}

// --- Streaming ghost message (shown while agent is typing) ---
export function StreamingMessage({ agentId, text }: { agentId: string; text: string }) {
  const agentColor = AGENT_COLORS[agentId] ?? "text-console-muted";

  if (!text) {
    // Typing indicator — no text yet
    return (
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-3 h-3 text-console-muted shrink-0" />
          <span className={cn("text-[11px] font-semibold font-mono", agentColor)}>
            {agentId}
          </span>
          <span className="text-[9px] text-console-dim italic">is thinking...</span>
        </div>
        <div className="pl-5 flex gap-1">
          <span className="w-1.5 h-1.5 bg-console-dim rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-console-dim rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-console-dim rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  // Streaming text — show accumulated markdown with pulsing cursor
  return (
    <div className="px-4 py-2.5 bg-console-elevated/10">
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-3 h-3 text-console-muted shrink-0 animate-pulse" />
        <span className={cn("text-[11px] font-semibold font-mono", agentColor)}>
          {agentId}
        </span>
        <span className="text-[9px] text-console-dim italic">typing...</span>
      </div>
      <div className="pl-5">
        <MessageContent text={text} isSystem={false} />
        <span className="inline-block w-1.5 h-4 bg-console-accent/70 animate-pulse ml-0.5 align-text-bottom" />
      </div>
    </div>
  );
}

function highlightMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-console-accent font-semibold">{part}</span>
    ) : (
      part
    ),
  );
}

function formatRelativeTime(iso: string): string {
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

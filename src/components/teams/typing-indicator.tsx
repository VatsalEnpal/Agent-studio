"use client";

import { useState, useEffect } from "react";
import { SessionsIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { agentColor } from "@/lib/design-tokens";
import type { TypingAgent, RoomAgent } from "@/stores/rooms";

interface TypingIndicatorProps {
  typingAgents: TypingAgent[];
  roomAgents: RoomAgent[];
}

export function TypingIndicator({ typingAgents, roomAgents }: TypingIndicatorProps) {
  if (typingAgents.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-border-subtle bg-bg-surface/50 space-y-1.5">
      {typingAgents.map((ta) => {
        const agent = roomAgents.find((a) => a.id === ta.agentId);
        return (
          <TypingAgentLine
            key={ta.agentId}
            agentId={ta.agentId}
            activity={ta.activity}
            startedAt={ta.startedAt}
            sessionId={agent?.sessionId}
          />
        );
      })}
    </div>
  );
}

function TypingAgentLine({
  agentId,
  activity,
  startedAt,
  sessionId,
}: {
  agentId: string;
  activity: string;
  startedAt: string;
  sessionId?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const color = agentColor(agentId);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const formatElapsed = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  const displayActivity = activity
    ? activity.replace(/^(Read|Edit|Write|Bash|Grep|Glob)\s*/, (_, tool) => `${tool.toLowerCase()} `)
    : "working...";

  return (
    <div className="flex items-center gap-2 text-label">
      {/* Pulsing dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0 animate-pulse-dot"
        style={{ backgroundColor: color }}
      />

      {/* Agent name */}
      <span className="font-medium shrink-0" style={{ color }}>
        {agentId}
      </span>

      {/* Activity text */}
      <span className="text-text-ghost truncate flex-1 min-w-0">
        {displayActivity}
      </span>

      {/* Elapsed time */}
      <span className="text-text-ghost tabular-nums shrink-0">
        ({formatElapsed(elapsed)})
      </span>

      {/* View Terminal link */}
      {sessionId && (
        <a
          href={`#session-${sessionId}`}
          className="text-rooms hover:text-rooms/80 text-label transition-colors shrink-0 flex items-center gap-0.5"
          title="View terminal session"
        >
          <SessionsIcon size={12} />
          Terminal
        </a>
      )}
    </div>
  );
}

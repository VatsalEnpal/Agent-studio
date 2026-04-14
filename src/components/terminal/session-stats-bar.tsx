"use client";

import { useSessionUsage, formatCostDisplay, formatTokensDisplay } from "@/hooks/use-usage";
import { useSessionsStore } from "@/stores/sessions";
import { contextColor } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

interface SessionStatsBarProps {
  sessionId: string;
}

export function SessionStatsBar({ sessionId }: SessionStatsBarProps) {
  const session = useSessionsStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const usage = useSessionUsage(sessionId);

  if (!session) return null;

  const model = usage.modelShort ?? session.meta?.model ?? null;
  const cost = usage.totalCost;
  const tokens = usage.totalTokens;
  const ctxPct = usage.contextPercent;

  // Don't render if there's no meaningful data yet
  if (usage.loading && !model) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1 border-b border-border-default bg-bg-surface/50 shrink-0">
      {/* Model badge */}
      {model && model !== "unknown" && (
        <span
          className={cn(
            "text-2xs font-mono font-medium uppercase tracking-wider px-1.5 py-0.5 rounded",
            "bg-[#f59e0b]/10 text-[#f59e0b]",
          )}
        >
          {model}
        </span>
      )}

      {/* Token count */}
      {tokens > 0 && (
        <span className="text-2xs text-text-ghost font-mono">
          {formatTokensDisplay(tokens)} tokens
        </span>
      )}

      {/* Cost */}
      {cost > 0 && (
        <span className="text-2xs text-sprints/80 font-mono">{formatCostDisplay(cost)}</span>
      )}

      <span className="flex-1" />

      {/* Context window usage bar */}
      {ctxPct > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-text-ghost">Context</span>
          <div className="w-20 h-1 bg-border-default rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, ctxPct)}%`,
                backgroundColor: contextColor(ctxPct),
              }}
            />
          </div>
          <span
            className={cn(
              "text-2xs font-mono tabular-nums",
              ctxPct >= 80 ? "text-error" : ctxPct >= 60 ? "text-sprints" : "text-text-ghost",
            )}
          >
            {Math.round(ctxPct)}%
          </span>
        </div>
      )}

      {/* CWD */}
      <span
        className="text-2xs text-text-ghost font-mono truncate max-w-[200px]"
        title={session.cwd}
      >
        {shortenCwd(session.cwd)}
      </span>
    </div>
  );
}

function shortenCwd(cwd: string): string {
  const homeMatch = cwd.match(/^\/(?:Users|home)\/[^/]+/);
  if (homeMatch) return "~" + cwd.slice(homeMatch[0].length);
  return cwd;
}

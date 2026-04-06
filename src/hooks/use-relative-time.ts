"use client";

import { useState, useEffect } from "react";

/**
 * Format a timestamp as a relative string ("just now", "2m ago", "1h ago", etc.).
 * Re-renders periodically so the label stays fresh.
 */
function formatRelative(iso: string | number): string {
  const then = typeof iso === "number" ? iso : new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(then).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * Returns a live-updating relative time string.
 * Updates every ~30s for recent timestamps, less frequently for older ones.
 */
export function useRelativeTime(iso: string | number | undefined): string {
  const [text, setText] = useState(() => (iso ? formatRelative(iso) : ""));

  useEffect(() => {
    if (!iso) return;
    setText(formatRelative(iso));

    // Determine update interval based on age
    const then = typeof iso === "number" ? iso : new Date(iso).getTime();
    const ageSec = Math.floor((Date.now() - then) / 1000);
    // < 1 min: update every 10s, < 1 hr: every 30s, older: every 60s
    const interval =
      ageSec < 60 ? 10_000 : ageSec < 3600 ? 30_000 : 60_000;

    const timer = setInterval(() => {
      setText(formatRelative(iso));
    }, interval);

    return () => clearInterval(timer);
  }, [iso]);

  return text;
}

/**
 * Pure formatting function (no hook) for use in loops or non-component contexts.
 */
export { formatRelative };

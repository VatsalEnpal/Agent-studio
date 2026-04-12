"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// AmberLoadingBar — thin animated bar for async actions (IDENTITY.md spec)
// ---------------------------------------------------------------------------

interface AmberLoadingBarProps {
  className?: string;
}

/**
 * Thin amber line that animates left-to-right, like YouTube's loading bar.
 * Used for async actions (View Changes, server start/stop, commit, push).
 */
export function AmberLoadingBar({ className }: AmberLoadingBarProps) {
  return <div className={cn("amber-loading-bar", className)} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Base Skeleton — shimmer rectangle
// ---------------------------------------------------------------------------

interface SkeletonProps {
  className?: string;
  /** Width in CSS units (default: "100%") */
  width?: string;
  /** Height in CSS units (default: "16px") */
  height?: string;
}

export function Skeleton({ className, width = "100%", height = "16px" }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton rounded", className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// SkeletonCard — matches session-card dimensions (~72px tall)
// ---------------------------------------------------------------------------

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 rounded-lg border border-border-subtle bg-surface",
        className,
      )}
      aria-hidden="true"
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        <Skeleton width="10px" height="10px" className="rounded-full shrink-0" />
        <Skeleton width="60%" height="14px" />
      </div>
      {/* Subtitle */}
      <Skeleton width="40%" height="12px" />
      {/* Bottom row */}
      <div className="flex items-center gap-3 mt-1">
        <Skeleton width="48px" height="10px" />
        <Skeleton width="32px" height="10px" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkeletonList — stack of 3-5 skeleton cards
// ---------------------------------------------------------------------------

interface SkeletonListProps {
  count?: number;
  className?: string;
}

export function SkeletonList({ count = 4, className }: SkeletonListProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-label="Loading...">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkeletonDetail — right panel skeleton (title + paragraphs)
// ---------------------------------------------------------------------------

export function SkeletonDetail({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col gap-4 p-6", className)}
      aria-label="Loading details..."
    >
      {/* Title */}
      <Skeleton width="45%" height="20px" />

      {/* Meta row */}
      <div className="flex items-center gap-3">
        <Skeleton width="80px" height="12px" />
        <Skeleton width="60px" height="12px" />
        <Skeleton width="40px" height="12px" />
      </div>

      {/* Paragraph lines */}
      <div className="flex flex-col gap-2 mt-2">
        <Skeleton width="100%" height="13px" />
        <Skeleton width="92%" height="13px" />
        <Skeleton width="85%" height="13px" />
        <Skeleton width="70%" height="13px" />
      </div>

      {/* Second paragraph */}
      <div className="flex flex-col gap-2 mt-2">
        <Skeleton width="95%" height="13px" />
        <Skeleton width="88%" height="13px" />
        <Skeleton width="60%" height="13px" />
      </div>
    </div>
  );
}

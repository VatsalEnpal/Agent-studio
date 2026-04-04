"use client";

import { CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface SessionGroupProps {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function SessionGroup({
  title,
  count,
  children,
  defaultOpen = true,
}: SessionGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-console-dim hover:text-console-muted active:text-console-text transition-colors"
      >
        <CaretRight className={cn(
          "w-2.5 h-2.5 transition-transform duration-150",
          open && "rotate-90",
        )} />
        <span>{title}</span>
        <span className="ml-auto text-console-dim/60 text-[8px] tabular-nums">{count}</span>
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

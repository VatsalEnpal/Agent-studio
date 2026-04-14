"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TourStep {
  target: string; // CSS selector for the target element
  title: string;
  body: string;
  position: "right" | "bottom";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-nav="sessions"]',
    title: "Sessions",
    body: "Launch Claude Code terminals here. Run multiple sessions side by side.",
    position: "right",
  },
  {
    target: '[data-nav="teams"]',
    title: "Teams",
    body: "Create agent collaboration rooms. Multiple agents work together on tasks.",
    position: "right",
  },
  {
    target: '[data-nav="knowledge"]',
    title: "Memory",
    body: "Your agents learn from every session. Insights are extracted and reused.",
    position: "right",
  },
  {
    target: '[data-nav="settings"]',
    title: "Settings",
    body: "Configure models, permissions, and manage your projects.",
    position: "right",
  },
];

const STORAGE_KEY = "agent-studio-tour-completed";

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Delay tour start so UI has time to render
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Position the tooltip next to the target element
  useEffect(() => {
    if (!visible) return;
    const current = TOUR_STEPS[step];
    if (!current) return;
    const el = document.querySelector(current.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (current.position === "right") {
      setPos({
        top: rect.top + rect.height / 2 - 40,
        left: rect.right + 12,
      });
    } else {
      setPos({
        top: rect.bottom + 12,
        left: rect.left + rect.width / 2 - 120,
      });
    }
  }, [step, visible]);

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem(STORAGE_KEY, "true");
      setVisible(false);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  }, []);

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  if (!current) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[9998]" onClick={handleSkip} />

      {/* Tooltip */}
      <div
        className={cn(
          "fixed z-[9999] w-[240px] rounded-lg border border-[#f59e0b]/30 bg-bg-surface shadow-xl",
          "animate-in fade-in slide-in-from-left-2 duration-200",
        )}
        style={{ top: pos.top, left: pos.left }}
      >
        {/* Arrow */}
        <div className="absolute -left-1.5 top-8 w-3 h-3 rotate-45 bg-bg-surface border-l border-b border-[#f59e0b]/30" />

        <div className="p-3 relative">
          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-2">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  i === step ? "bg-[#f59e0b]" : "bg-border-default",
                )}
              />
            ))}
          </div>

          <h4 className="text-sm font-semibold text-text-primary mb-1">{current.title}</h4>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">{current.body}</p>

          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-2xs text-text-ghost hover:text-text-tertiary transition-all"
            >
              Skip tour
            </button>
            <button
              onClick={handleNext}
              className="px-3 py-1 text-xs font-medium rounded bg-[#f59e0b] text-black hover:bg-[#f59e0b]/90 transition-all active:scale-[0.97]"
            >
              {step < TOUR_STEPS.length - 1 ? "Next" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

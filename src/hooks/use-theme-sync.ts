"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/ui";

/**
 * Syncs the Zustand theme state with the <html> class.
 * Call this once in the root client component.
 */
export function useThemeSync() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [theme]);
}

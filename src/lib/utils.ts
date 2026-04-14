import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Compute grid layout CSS classes based on number of visible panes.
 * Returns { gridClass, itemClasses } where itemClasses[i] is
 * the CSS class for the i-th item.
 */
export function computeGridLayout(count: number): {
  gridClass: string;
  spanClasses: string[];
} {
  switch (count) {
    case 0:
      return { gridClass: "grid-cols-1 grid-rows-1", spanClasses: [] };
    case 1:
      return {
        gridClass: "grid-cols-1 grid-rows-1",
        spanClasses: ["col-span-1 row-span-1"],
      };
    case 2:
      return {
        gridClass: "grid-cols-2 grid-rows-1",
        spanClasses: ["col-span-1 row-span-1", "col-span-1 row-span-1"],
      };
    case 3:
      return {
        gridClass: "grid-cols-2 grid-rows-2",
        spanClasses: ["col-span-1 row-span-1", "col-span-1 row-span-1", "col-span-2 row-span-1"],
      };
    case 4:
      return {
        gridClass: "grid-cols-2 grid-rows-2",
        spanClasses: [
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
        ],
      };
    case 5:
      return {
        gridClass: "grid-cols-2 grid-rows-3",
        spanClasses: [
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-2 row-span-1",
        ],
      };
    case 6:
    default:
      return {
        gridClass: "grid-cols-2 grid-rows-3",
        spanClasses: [
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
          "col-span-1 row-span-1",
        ],
      };
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-sessions";
    case "building":
      return "bg-rooms";
    case "idle":
      return "bg-text-secondary";
    case "exited":
      return "bg-error";
    case "starting":
      return "bg-rooms";
    default:
      return "bg-text-tertiary";
  }
}

/** Shorten a cwd path for display — replaces home directory prefix with ~ */
export function shortenCwd(cwd: string): string {
  if (cwd === "unknown") return "--";
  const homeMatch = cwd.match(/^\/(?:Users|home)\/[^/]+/);
  if (homeMatch) return "~" + cwd.slice(homeMatch[0].length);
  return cwd;
}

export function statusDotColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-sessions";
    case "building":
      return "bg-rooms animate-pulse";
    case "idle":
      return "bg-text-secondary";
    case "exited":
      return "bg-error";
    case "starting":
      return "bg-rooms animate-pulse";
    default:
      return "bg-text-tertiary";
  }
}

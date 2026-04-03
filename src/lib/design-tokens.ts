// =============================================================================
// Agent Studio v2 — Design Tokens
// "Notion x Whispr Flow" — clean, minimal, whitespace-heavy, dark-mode primary
// =============================================================================

// ---------------------------------------------------------------------------
// Elevation (5 levels — darkest canvas to lightest tooltip)
// ---------------------------------------------------------------------------

export const elevation = {
  0: "#0a0a0a", // canvas
  1: "#111214", // sidebar, cards — warm black
  2: "#161616", // hover
  3: "#1a1a1a", // modals
  4: "#1f1f1f", // tooltips
} as const;

// ---------------------------------------------------------------------------
// Colors — semantic tokens
// ---------------------------------------------------------------------------

export const colors = {
  // Surfaces
  bg: elevation[0],
  surface: elevation[1],
  surfaceHover: elevation[2],
  surfaceActive: "#1c1c1c",
  surfaceOverlay: "rgba(17, 18, 20, 0.80)",

  // Borders
  border: "#232323",
  borderSubtle: "#1a1a1a",

  // Text hierarchy
  textPrimary: "#d4d4d4", // slightly muted for eye comfort
  textEmphasis: "#f5f5f5", // headings
  textSecondary: "#737373",
  textTertiary: "#525252",

  // Accent
  accent: "#4F8FF7",
  accentHover: "#6BA3FA",
  accentPressed: "#3A7DE5",
  accentSubtle: "rgba(79, 143, 247, 0.08)",
  accentGlow: "0 0 20px rgba(79, 143, 247, 0.25)",

  // Semantic status
  success: "#34D399",
  successSubtle: "rgba(52, 211, 153, 0.08)",
  warning: "#FBBF24",
  warningSubtle: "rgba(251, 191, 36, 0.08)",
  error: "#F87171",
  errorSubtle: "rgba(248, 113, 113, 0.08)",
} as const;

// ---------------------------------------------------------------------------
// Agent avatar palette — 8 deterministic colors
// ---------------------------------------------------------------------------

export const agentPalette = [
  "#4F8FF7", // blue
  "#34D399", // emerald
  "#F472B6", // pink
  "#FBBF24", // amber
  "#A78BFA", // violet
  "#FB923C", // orange
  "#22D3EE", // cyan
  "#E879F9", // fuchsia
] as const;

// ---------------------------------------------------------------------------
// Typography — 8 levels + code
// ---------------------------------------------------------------------------

export type TypographyToken = {
  fontSize: string;
  fontWeight: number;
  lineHeight: string;
  letterSpacing: string;
};

export const typography: Record<string, TypographyToken> = {
  display: {
    fontSize: "28px",
    fontWeight: 600,
    lineHeight: "1.2",
    letterSpacing: "-0.02em",
  },
  titleLg: {
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: "1.3",
    letterSpacing: "-0.01em",
  },
  titleMd: {
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: "1.4",
    letterSpacing: "-0.01em",
  },
  titleSm: {
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "1.4",
    letterSpacing: "0",
  },
  body: {
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: "1.6",
    letterSpacing: "0",
  },
  bodySm: {
    fontSize: "13px",
    fontWeight: 400,
    lineHeight: "1.5",
    letterSpacing: "0",
  },
  label: {
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: "1.4",
    letterSpacing: "0.02em",
  },
  labelXs: {
    fontSize: "11px",
    fontWeight: 500,
    lineHeight: "1.4",
    letterSpacing: "0.04em",
  },
} as const;

export const codeFont = {
  fontFamily: "'Geist Mono', 'SF Mono', 'JetBrains Mono', Menlo, monospace",
  fontSize: "13px",
} as const;

// ---------------------------------------------------------------------------
// Spacing (base-4 scale)
// ---------------------------------------------------------------------------

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

export const radius = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  full: "9999px",
} as const;

// ---------------------------------------------------------------------------
// Animations — 5 presets
// ---------------------------------------------------------------------------

export const animation = {
  instant: "100ms ease-out", // button hover
  quick: "150ms ease-out", // card selection
  smooth: "250ms cubic-bezier(0.16, 1, 0.3, 1)", // panels, pages
  bounce: "300ms cubic-bezier(0.34, 1.56, 0.64, 1)", // celebrations
  pulse: "1.5s ease-in-out", // typing indicator
} as const;

// ---------------------------------------------------------------------------
// Shadows (optimized for dark mode)
// ---------------------------------------------------------------------------

export const shadows = {
  elevated: "inset 0 1px 0 rgba(255, 255, 255, 0.03)", // top-light effect
  modal: "0 25px 50px rgba(0, 0, 0, 0.5)",
  toast: "0 4px 12px rgba(0, 0, 0, 0.4)",
} as const;

// ---------------------------------------------------------------------------
// Z-index layers
// ---------------------------------------------------------------------------

export const zIndex = {
  sidebar: 10,
  statusBar: 20,
  topBar: 30,
  dropdown: 40,
  modal: 50,
  toast: 60,
  commandPalette: 70,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic agent color from name.
 * Uses a simple djb2 hash to pick from the 8-color palette.
 */
export function agentColor(name: string): string {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % agentPalette.length;
  return agentPalette[index];
}

/**
 * Context usage color — green/yellow/red thresholds.
 *
 * @param percent - 0 to 100
 * @returns A hex color string
 */
export function contextColor(percent: number): string {
  if (percent < 60) return colors.success;
  if (percent < 80) return colors.warning;
  return colors.error;
}

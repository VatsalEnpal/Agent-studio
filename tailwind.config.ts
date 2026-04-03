import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // -----------------------------------------------------------------
      // Fonts
      // -----------------------------------------------------------------
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "SF Mono",
          "JetBrains Mono",
          "Menlo",
          "monospace",
        ],
      },

      // -----------------------------------------------------------------
      // Colors — semantic tokens from design-tokens.ts exposed as
      // CSS custom properties so both Tailwind and raw CSS can use them
      // -----------------------------------------------------------------
      colors: {
        // Elevation surfaces
        canvas: "var(--elevation-0)",
        surface: {
          DEFAULT: "var(--elevation-1)",
          hover: "var(--elevation-2)",
          active: "var(--surface-active)",
          overlay: "var(--surface-overlay)",
        },
        elevation: {
          0: "var(--elevation-0)",
          1: "var(--elevation-1)",
          2: "var(--elevation-2)",
          3: "var(--elevation-3)",
          4: "var(--elevation-4)",
        },

        // Borders
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
        },

        // Text
        "text-primary": "var(--text-primary)",
        "text-emphasis": "var(--text-emphasis)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",

        // Accent
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          pressed: "var(--accent-pressed)",
          subtle: "var(--accent-subtle)",
        },

        // Semantic status
        success: {
          DEFAULT: "var(--success)",
          subtle: "var(--success-subtle)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          subtle: "var(--warning-subtle)",
        },
        error: {
          DEFAULT: "var(--error)",
          subtle: "var(--error-subtle)",
        },

        // Legacy v1 aliases (backwards compat)
        "console-bg": "var(--elevation-0)",
        "console-panel": "var(--elevation-1)",
        "console-border": "var(--border)",
        "console-accent": "var(--accent)",
        "console-accent-glow": "rgba(79, 143, 247, 0.15)",
        "console-success": "var(--success)",
        "console-error": "var(--error)",
        "console-text": "var(--text-primary)",
        "console-muted": "var(--text-secondary)",
        "console-dim": "var(--text-tertiary)",
        "console-faint": "var(--elevation-2)",
      },

      // -----------------------------------------------------------------
      // Spacing (base-4)
      // -----------------------------------------------------------------
      spacing: {
        "4.5": "18px",
        "13": "52px",
        "15": "60px",
        "18": "72px",
      },

      // -----------------------------------------------------------------
      // Border radius
      // -----------------------------------------------------------------
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        full: "9999px",
      },

      // -----------------------------------------------------------------
      // Shadows
      // -----------------------------------------------------------------
      boxShadow: {
        elevated: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
        modal: "0 25px 50px rgba(0, 0, 0, 0.5)",
        toast: "0 4px 12px rgba(0, 0, 0, 0.4)",
        "accent-glow": "0 0 20px rgba(79, 143, 247, 0.25)",
        // Legacy
        "glow-amber": "0 0 16px rgba(245, 158, 11, 0.12)",
        "glow-sm": "0 0 8px rgba(245, 158, 11, 0.08)",
        card: "0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)",
        "card-hover":
          "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)",
      },

      // -----------------------------------------------------------------
      // Z-index
      // -----------------------------------------------------------------
      zIndex: {
        sidebar: "10",
        statusBar: "20",
        topBar: "30",
        dropdown: "40",
        modal: "50",
        toast: "60",
        commandPalette: "70",
      },

      // -----------------------------------------------------------------
      // Font size presets (maps to typography tokens)
      // -----------------------------------------------------------------
      fontSize: {
        display: [
          "28px",
          { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        "title-lg": [
          "20px",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "title-md": [
          "16px",
          { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "title-sm": [
          "14px",
          { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" },
        ],
        body: [
          "14px",
          { lineHeight: "1.6", letterSpacing: "0", fontWeight: "400" },
        ],
        "body-sm": [
          "13px",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" },
        ],
        label: [
          "12px",
          { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" },
        ],
        "label-xs": [
          "11px",
          { lineHeight: "1.4", letterSpacing: "0.04em", fontWeight: "500" },
        ],
      },

      // -----------------------------------------------------------------
      // Animations
      // -----------------------------------------------------------------
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          from: { opacity: "0", transform: "translateX(100%)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        pageCrossfade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        messageSlideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        gateBounce: {
          "0%": { opacity: "0", transform: "scale(0.3)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        panelSlideIn: {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        cmdPaletteIn: {
          from: { opacity: "0", transform: "scale(0.95) translateY(-8px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        sessionCrossfade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fadeIn 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slideInRight 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 1.5s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.5s ease-in-out infinite",
        "page-crossfade": "pageCrossfade 200ms ease-out",
        "message-in": "messageSlideUp 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "gate-bounce": "gateBounce 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        "panel-in": "panelSlideIn 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "cmd-palette-in": "cmdPaletteIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "session-crossfade": "sessionCrossfade 200ms ease-out",
      },

      // -----------------------------------------------------------------
      // Backdrop blur utilities
      // -----------------------------------------------------------------
      backdropBlur: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "20px",
        xl: "40px",
      },
    },
  },
  plugins: [],
};

export default config;

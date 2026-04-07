import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // -----------------------------------------------------------------
      // Fonts — system font stack (no Geist)
      // -----------------------------------------------------------------
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "SFMono-Regular",
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
      },

      // -----------------------------------------------------------------
      // Colors — new pillar accent system with semantic tokens
      // -----------------------------------------------------------------
      colors: {
        // Base surfaces
        bg: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          input: "var(--bg-input)",
        },

        // Borders
        border: {
          DEFAULT: "var(--border-default)",
          default: "var(--border-default)",
          subtle: "var(--border-subtle)",
        },

        // Text
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          ghost: "var(--text-ghost)",
        },

        // Pillar accents
        sessions: {
          DEFAULT: "var(--accent-sessions)",
          glow: "var(--accent-sessions-glow)",
          subtle: "var(--accent-sessions-subtle)",
        },
        rooms: {
          DEFAULT: "var(--accent-rooms)",
          glow: "var(--accent-rooms-glow)",
          subtle: "var(--accent-rooms-subtle)",
        },
        sprints: {
          DEFAULT: "var(--accent-sprints)",
          glow: "var(--accent-sprints-glow)",
          subtle: "var(--accent-sprints-subtle)",
        },
        memory: {
          DEFAULT: "var(--accent-memory)",
          glow: "var(--accent-memory-glow)",
          subtle: "var(--accent-memory-subtle)",
        },

        // Semantic status
        success: {
          DEFAULT: "var(--color-success)",
          subtle: "var(--success-subtle)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          subtle: "var(--warning-subtle)",
        },
        error: {
          DEFAULT: "var(--color-error)",
          subtle: "var(--error-subtle)",
        },

        // Legacy aliases (backward compat for existing components)
        canvas: "var(--bg-base)",
        surface: {
          DEFAULT: "var(--bg-surface)",
          hover: "var(--bg-elevated)",
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
        "text-primary": "var(--text-primary)",
        "text-emphasis": "var(--text-emphasis)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          pressed: "var(--accent-pressed)",
          subtle: "var(--accent-subtle)",
        },
        "console-bg": "var(--elevation-0)",
        "console-panel": "var(--elevation-1)",
        "console-border": "var(--border-default)",
        "console-accent": "var(--accent)",
        "console-accent-glow": "var(--accent-rooms-glow)",
        "console-success": "var(--color-success)",
        "console-error": "var(--color-error)",
        "console-text": "var(--text-primary)",
        "console-muted": "var(--text-secondary)",
        "console-dim": "var(--text-tertiary)",
        "console-faint": "var(--bg-elevated)",
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
      // Shadows — updated to use new tokens
      // -----------------------------------------------------------------
      boxShadow: {
        elevated: "var(--shadow-elevated)",
        modal: "var(--shadow-modal)",
        toast: "var(--shadow-toast)",
        "accent-glow": "0 0 20px var(--accent-rooms-glow)",
        "sessions-glow": "0 0 6px var(--accent-sessions-glow)",
        "rooms-glow": "0 0 6px var(--accent-rooms-glow)",
        "sprints-glow": "0 0 6px var(--accent-sprints-glow)",
        "memory-glow": "0 0 6px var(--accent-memory-glow)",
        "glow-amber": "0 0 16px var(--accent-sprints-glow)",
        "glow-sm": "0 0 8px var(--accent-sprints-glow)",
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
        // Override Tailwind's built-in text-xs (12px → 10px) to match our compact body text
        xs: ["10px", { lineHeight: "1.5" }],
        // Clean 9px without weight/tracking — use for body-level 9px text
        "2xs": ["9px", { lineHeight: "1.4" }],
        display: [
          "16px",
          { lineHeight: "1.2", letterSpacing: "-0.025em", fontWeight: "600" },
        ],
        "title-lg": [
          "14px",
          { lineHeight: "1.3", letterSpacing: "-0.3px", fontWeight: "600" },
        ],
        "title-md": [
          "13px",
          { lineHeight: "1.4", letterSpacing: "-0.2px", fontWeight: "500" },
        ],
        "title-sm": [
          "12px",
          { lineHeight: "1.4", letterSpacing: "-0.1px", fontWeight: "500" },
        ],
        "section-heading": [
          "11px",
          { lineHeight: "1.4", letterSpacing: "-0.1px", fontWeight: "600" },
        ],
        body: [
          "11px",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" },
        ],
        "body-sm": [
          "10px",
          { lineHeight: "1.5", letterSpacing: "0", fontWeight: "400" },
        ],
        label: [
          "9px",
          {
            lineHeight: "1.4",
            letterSpacing: "0.5px",
            fontWeight: "600",
          },
        ],
        "label-xs": [
          "9px",
          { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "400" },
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

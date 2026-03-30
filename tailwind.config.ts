import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['Menlo', 'Consolas', 'Courier New', 'monospace'],
      },
      colors: {
        'console-bg': '#0a0b0e',
        'console-panel': '#111218',
        'console-border': '#1e2028',
        'console-accent': '#f59e0b',
        'console-accent-glow': 'rgba(245, 158, 11, 0.15)',
        'console-success': '#4ade80',
        'console-error': '#ef4444',
        'console-text': '#d4d4dc',
        'console-muted': '#8b8b9e',
        'console-dim': '#555568',
        'console-faint': '#2a2b35',
      },
      boxShadow: {
        'glow-amber': '0 0 16px rgba(245, 158, 11, 0.12)',
        'glow-sm': '0 0 8px rgba(245, 158, 11, 0.08)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
      },
      borderRadius: {
        'xl': '12px',
      },
    },
  },
  plugins: [],
};

export default config;

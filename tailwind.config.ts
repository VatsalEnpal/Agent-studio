import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-mono)', 'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        mono: ['var(--font-geist-mono)', 'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      colors: {
        'console-bg': 'var(--bg-base)',
        'console-panel': 'var(--bg-panel)',
        'console-border': 'var(--border-color)',
        'console-accent': 'var(--accent-color)',
        'console-accent-glow': 'rgba(245, 158, 11, 0.15)',
        'console-success': 'var(--success-color)',
        'console-error': 'var(--error-color)',
        'console-text': 'var(--text-normal)',
        'console-muted': 'var(--text-muted)',
        'console-dim': 'var(--text-dim)',
        'console-faint': 'var(--bg-faint)',
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

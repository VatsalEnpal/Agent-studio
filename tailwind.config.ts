import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'console-bg': '#0a0a0a',
        'console-panel': '#111111',
        'console-border': '#1a1a1a',
        'console-accent': '#f59e0b',
        'console-success': '#4ade80',
        'console-error': '#ef4444',
        'console-text': '#cccccc',
        'console-muted': '#888888',
        'console-dim': '#555555',
        'console-faint': '#333333',
      },
    },
  },
  plugins: [],
};

export default config;

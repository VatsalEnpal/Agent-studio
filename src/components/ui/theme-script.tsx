/**
 * Inline script that runs before React hydration to set the theme class on <html>.
 * Prevents a flash of wrong theme on load.
 */
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var t = localStorage.getItem('agent-studio-theme');
        if (t === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
        }
      } catch(e) { console.error('Failed to apply saved theme:', e); }
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

"use client";

const SHORTCUTS = [
  { keys: "Cmd + N", description: "Open session launcher" },
  { keys: "Cmd + K", description: "Open command palette" },
  { keys: "Cmd + \\", description: "Toggle sidebar" },
  { keys: "Cmd + Enter", description: "Fullscreen focused pane" },
  { keys: "Cmd + 1-6", description: "Focus session by position" },
  { keys: "Tab", description: "Cycle focus between sessions" },
  { keys: "Escape", description: "Exit fullscreen / close modals" },
  { keys: "F11", description: "Toggle fullscreen mode" },
];

export function SettingsShortcuts() {
  return (
    <section className="border border-console-border rounded-lg bg-console-panel">
      <div className="px-4 py-3 border-b border-console-border">
        <h3 className="text-xs font-medium text-console-text">Keyboard Shortcuts</h3>
      </div>
      <div className="px-4 py-2">
        <table className="w-full">
          <tbody>
            {SHORTCUTS.map((shortcut) => (
              <tr key={shortcut.keys} className="border-b border-console-border/30 last:border-0">
                <td className="py-2 pr-4">
                  <kbd className="px-2 py-0.5 text-[10px] font-mono bg-console-bg border border-console-border rounded text-console-text">
                    {shortcut.keys}
                  </kbd>
                </td>
                <td className="py-2 text-[10px] text-console-muted">
                  {shortcut.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

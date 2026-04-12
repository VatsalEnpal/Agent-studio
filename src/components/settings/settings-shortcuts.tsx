"use client";

const SHORTCUTS = [
  { keys: "Cmd + Shift + N", description: "Open session launcher" },
  { keys: "Cmd + Shift + K", description: "Open command palette" },
  { keys: "Cmd + Shift + \\", description: "Toggle sidebar" },
  { keys: "Cmd + Shift + F", description: "Toggle fullscreen mode" },
  { keys: "Cmd + Enter", description: "Fullscreen focused pane" },
  { keys: "Cmd + Shift + 1-6", description: "Focus session by position" },
  { keys: "Tab", description: "Cycle focus between sessions" },
  { keys: "Escape", description: "Exit fullscreen / close modals" },
];

export function SettingsShortcuts() {
  return (
    <section className="border border-border-default rounded bg-bg-surface">
      <div className="px-4 py-3 border-b border-border-default">
        <h3 className="text-body font-medium text-text-primary">Keyboard Shortcuts</h3>
      </div>
      <div className="px-4 py-2">
        <table className="w-full">
          <tbody>
            {SHORTCUTS.map((shortcut) => (
              <tr key={shortcut.keys} className="border-b border-border-default/30 last:border-0">
                <td className="py-2 pr-4">
                  <kbd className="px-2 py-0.5 text-label font-mono bg-bg-base border border-border-default rounded text-text-primary">
                    {shortcut.keys}
                  </kbd>
                </td>
                <td className="py-2 text-label text-text-secondary">
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

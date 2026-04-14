"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { DownloadIcon, CheckIcon, SpinnerIcon, RocketIcon } from "@/components/ui/icons";

// ---------- Types ----------

interface DetectedProject {
  name: string;
  path: string;
  techStack: string[];
  languages: string[];
  packageManager: string;
  devCommand?: string;
  hasAgentSystem: boolean;
  gitBranch: string;
  lastCommit: string;
  lastModified: number;
}

interface ImportedAgent {
  id: string;
  name: string;
  path: string;
}

interface QuickImportProps {
  /** Called when user clicks "Launch Session" after importing */
  onLaunchSession: (config: { name: string; agent: string; cwd: string }) => void;
  /** Called after a successful import so parent can refresh agent lists */
  onImportComplete?: (agent: ImportedAgent) => void;
}

// ---------- Component ----------

export function QuickImport({ onLaunchSession, onImportComplete }: QuickImportProps) {
  const [projects, setProjects] = useState<DetectedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const [importedAgents, setImportedAgents] = useState<Map<string, ImportedAgent>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // Fetch detected projects on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/system/detect", { method: "POST" });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { projects: DetectedProject[] };
        // Only show projects without existing agent systems, deduplicated by name
        const unimported = (data.projects ?? []).filter((p) => !p.hasAgentSystem);
        const seen = new Set<string>();
        const deduped = unimported.filter((p) => {
          const key = p.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setProjects(deduped);
      } catch {
        // Silently fail -- this is a nice-to-have section
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleImport = useCallback(
    async (project: DetectedProject) => {
      if (importingPath) return; // one at a time
      setImportingPath(project.path);
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(project.path);
        return next;
      });

      try {
        const res = await fetch("/api/quick-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectPath: project.path }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? `Import failed (${String(res.status)})`);
        }

        const data = (await res.json()) as {
          agent: ImportedAgent;
          claudeMd: string;
          profile: Record<string, unknown>;
        };

        setImportedAgents((prev) => {
          const next = new Map(prev);
          next.set(project.path, data.agent);
          return next;
        });

        // Remove from unimported list after a brief delay so user sees the success state
        setTimeout(() => {
          setProjects((prev) => prev.filter((p) => p.path !== project.path));
        }, 3000);

        onImportComplete?.(data.agent);
      } catch (err) {
        setErrors((prev) => {
          const next = new Map(prev);
          next.set(project.path, err instanceof Error ? err.message : "Import failed");
          return next;
        });
      } finally {
        setImportingPath(null);
      }
    },
    [importingPath, onImportComplete],
  );

  // Don't render if loading or no unimported projects
  if (loading || projects.length === 0) {
    return null;
  }

  return (
    <div>
      <span className="block text-2xs font-medium uppercase text-text-ghost tracking-[0.5px] mb-1.5">
        Quick Import
      </span>
      <div className="text-xs text-text-ghost mb-2">
        {projects.length} project{projects.length !== 1 ? "s" : ""} detected without agents
        {" -- "}import in one click
      </div>
      <div className="space-y-1.5 max-h-[140px] overflow-y-auto scrollbar-thin">
        {projects.slice(0, 5).map((project) => {
          const imported = importedAgents.get(project.path);
          const isImporting = importingPath === project.path;
          const error = errors.get(project.path);

          return (
            <div
              key={project.path}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded border transition-all",
                imported
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : error
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border-default bg-bg-input",
              )}
            >
              {/* Project info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-text-primary truncate">
                    {project.name}
                  </span>
                  {project.techStack.slice(0, 3).map((tech) => (
                    <span
                      key={tech}
                      className="shrink-0 px-1 py-0.5 text-2xs rounded bg-bg-elevated text-text-ghost border border-border-default"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
                {error && <p className="text-2xs text-red-400 mt-0.5 truncate">{error}</p>}
              </div>

              {/* Action button */}
              {imported ? (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-2xs text-emerald-400">
                    <CheckIcon size={10} />
                    Imported
                  </span>
                  <button
                    onClick={() =>
                      onLaunchSession({
                        name: imported.id,
                        agent: imported.id,
                        cwd: project.path,
                      })
                    }
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium transition-all",
                      "border border-[#f59e0b]/30 bg-[#f59e0b]/5 text-[#f59e0b]",
                      "hover:border-[#f59e0b]/50 hover:bg-[#f59e0b]/10",
                    )}
                  >
                    <RocketIcon size={10} />
                    Launch
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleImport(project)}
                  disabled={isImporting}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium transition-all",
                    "border border-border-default",
                    isImporting
                      ? "opacity-50 cursor-not-allowed text-text-ghost"
                      : "text-text-secondary hover:border-[#f59e0b]/40 hover:bg-[#f59e0b]/5 hover:text-[#f59e0b]",
                  )}
                >
                  {isImporting ? (
                    <>
                      <SpinnerIcon size={10} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <DownloadIcon size={10} />
                      Import
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  GitPullRequest,
  ExternalLink,
  Loader2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useGitStore } from "@/stores/git";
import { cn } from "@/lib/utils";

const DEFAULT_TARGETS = ["main", "staging/frontend"];

export function PRModal() {
  const prModalOpen = useGitStore((s) => s.prModalOpen);
  const prModalRepo = useGitStore((s) => s.prModalRepo);
  const prStatus = useGitStore((s) => s.prStatus);
  const prResult = useGitStore((s) => s.prResult);
  const prError = useGitStore((s) => s.prError);
  const closePrModal = useGitStore((s) => s.closePrModal);
  const setPrStatus = useGitStore((s) => s.setPrStatus);
  const setPrResult = useGitStore((s) => s.setPrResult);
  const setPrError = useGitStore((s) => s.setPrError);

  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("main");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [branches, setBranches] = useState<string[]>(DEFAULT_TARGETS);

  // Prod safety: two-step confirmation
  const [confirmText, setConfirmText] = useState("");
  const [showProdConfirm, setShowProdConfirm] = useState(false);

  const isProd = prModalRepo?.isProd ?? false;

  // Pre-fill fields when modal opens with a repo
  useEffect(() => {
    if (prModalRepo) {
      setSourceBranch(prModalRepo.branch);
      const commitMsg = prModalRepo.lastCommit.replace(/^[a-f0-9]+\s+/, "");
      setTitle(commitMsg);
      setDescription("");
      setConfirmText("");
      setShowProdConfirm(false);

      fetch(`/api/git/branches?repo=${encodeURIComponent(prModalRepo.path)}`)
        .then((res) => res.json())
        .then((data: string[]) => {
          if (Array.isArray(data) && data.length > 0) {
            setBranches(data);
            if (data.includes("main")) {
              setTargetBranch("main");
            } else if (data.length > 0) {
              setTargetBranch(data[0]!);
            }
          }
        })
        .catch(() => {
          setBranches(DEFAULT_TARGETS);
        });
    }
  }, [prModalRepo]);

  const doCreatePR = useCallback(async () => {
    if (!prModalRepo || !sourceBranch || !targetBranch || !title) return;

    setPrStatus("creating");
    setPrError(null);

    try {
      const res = await fetch("/api/git/pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: prModalRepo.path,
          sourceBranch,
          targetBranch,
          title,
          description,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const result = (await res.json()) as { url: string; id: number };
      setPrResult(result);
      setPrStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setPrError(message);
      setPrStatus("error");
    }
  }, [
    prModalRepo,
    sourceBranch,
    targetBranch,
    title,
    description,
    setPrStatus,
    setPrResult,
    setPrError,
  ]);

  const handleSubmit = useCallback(() => {
    if (isProd && !showProdConfirm) {
      // Step 1: show confirmation
      setShowProdConfirm(true);
      return;
    }
    if (isProd && confirmText !== "CONFIRM") {
      return;
    }
    void doCreatePR();
  }, [isProd, showProdConfirm, confirmText, doCreatePR]);

  const canSubmit =
    !!title &&
    !!sourceBranch &&
    !!targetBranch &&
    prStatus !== "creating" &&
    (!isProd || !showProdConfirm || confirmText === "CONFIRM");

  return (
    <Dialog.Root
      open={prModalOpen}
      onOpenChange={(open) => {
        if (!open) closePrModal();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-console-bg border border-console-border rounded-lg shadow-2xl z-50 p-0 outline-none">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-console-border">
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-console-accent" />
              <Dialog.Title className="text-sm font-medium text-console-text">
                Create Pull Request
              </Dialog.Title>
              {isProd && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">
                  PROD
                </span>
              )}
            </div>
            <Dialog.Close className="p-1 text-console-dim hover:text-console-text transition-colors">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="px-4 py-3 space-y-3">
            {/* Prod warning banner */}
            {isProd && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-[10px]">
                  This is the <strong>production repository</strong>. This PR
                  will be reviewed by the team. Changes require explicit approval
                  from Vatsal.
                </p>
              </div>
            )}

            {/* Repo */}
            <div className="text-xs text-console-dim">
              Repo:{" "}
              <span className="text-console-muted">
                {prModalRepo?.name ?? "unknown"}
              </span>
            </div>

            {/* Source branch */}
            <div className="space-y-1">
              <label className="text-xs text-console-dim">Source branch</label>
              <input
                type="text"
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-console-panel border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
                disabled={prStatus === "creating"}
              />
            </div>

            {/* Target branch */}
            <div className="space-y-1">
              <label className="text-xs text-console-dim">Target branch</label>
              <select
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-console-panel border border-console-border rounded text-console-text focus:outline-none focus:border-console-accent"
                disabled={prStatus === "creating"}
              >
                {branches
                  .filter((b) => b !== sourceBranch)
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs text-console-dim">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-console-panel border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent"
                placeholder="PR title"
                disabled={prStatus === "creating"}
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs text-console-dim">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-2 py-1.5 text-xs bg-console-panel border border-console-border rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-console-accent resize-none"
                placeholder="Optional description..."
                disabled={prStatus === "creating"}
              />
            </div>

            {/* Prod confirmation step */}
            {isProd && showProdConfirm && prStatus !== "success" && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-500/15 border border-red-500/40 rounded text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <p className="text-[10px] font-bold">
                    CONFIRM: You are creating a PR on the PRODUCTION repo.
                  </p>
                  <p className="text-[9px]">
                    Type{" "}
                    <span className="font-mono font-bold bg-red-500/20 px-1 rounded">
                      CONFIRM
                    </span>{" "}
                    to proceed:
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type CONFIRM"
                    className="w-full px-2 py-1 text-xs bg-console-bg border border-red-500/40 rounded text-console-text placeholder:text-console-dim focus:outline-none focus:border-red-400"
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {prStatus === "error" && prError && (
              <div className="px-2 py-1.5 text-xs bg-console-error/10 border border-console-error/30 rounded text-console-error">
                {prError}
              </div>
            )}

            {/* Success */}
            {prStatus === "success" && prResult && (
              <div className="px-2 py-1.5 text-xs bg-console-success/10 border border-console-success/30 rounded text-console-success space-y-1">
                <div className="flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>PR #{prResult.id} created</span>
                </div>
                <a
                  href={prResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-console-accent hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open in Azure DevOps
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-console-border">
            <button
              onClick={closePrModal}
              className="px-3 py-1.5 text-xs text-console-muted hover:text-console-text transition-colors"
            >
              {prStatus === "success" ? "Close" : "Cancel"}
            </button>
            {prStatus !== "success" && (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors",
                  !canSubmit
                    ? "bg-console-border text-console-dim cursor-not-allowed"
                    : isProd
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-console-accent text-white hover:bg-console-accent/80",
                )}
              >
                {prStatus === "creating" && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                {prStatus === "creating"
                  ? "Creating..."
                  : isProd && !showProdConfirm
                    ? "Create PR (PROD)"
                    : "Create PR"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

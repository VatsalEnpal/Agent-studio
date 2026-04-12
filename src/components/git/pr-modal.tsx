"use client";

import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon, CheckIcon, WarningIcon } from "@/components/ui/icons";
import { useGitStore } from "@/stores/git";
import { cn } from "@/lib/utils";

const DEFAULT_TARGETS = ["main"];

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

  const inputCls =
    "w-full px-2.5 py-1.5 text-xs bg-bg-input border border-border-default rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-border-subtle transition-all";

  return (
    <Dialog.Root
      open={prModalOpen}
      onOpenChange={(o) => {
        if (!o) closePrModal();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-elevated border border-border-subtle rounded shadow-modal z-50 outline-none">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
            <div className="flex items-center gap-2">
              <Dialog.Title className="text-xs font-semibold text-text-primary">
                Create Pull Request
              </Dialog.Title>
              {isProd && (
                <span className="text-2xs px-1.5 py-0.5 rounded bg-error/20 text-error font-bold uppercase">
                  PROD
                </span>
              )}
            </div>
            <Dialog.Close className="p-1 text-text-ghost hover:text-text-secondary transition-all rounded">
              <CloseIcon size={14} />
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-3">
            {/* Prod warning banner */}
            {isProd && (
              <div className="flex items-start gap-2 px-3 py-2 bg-error/10 border border-error/20 rounded text-error">
                <WarningIcon size={14} className="shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  This is the <strong>production repository</strong>. This PR
                  will be reviewed by the team. Changes require explicit approval.
                </p>
              </div>
            )}

            {/* Repo */}
            <div className="text-xs text-text-ghost">
              Repo:{" "}
              <span className="text-text-secondary">
                {prModalRepo?.name ?? "unknown"}
              </span>
            </div>

            {/* Source branch */}
            <div>
              <span className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1">
                Source Branch
              </span>
              <input
                type="text"
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className={inputCls}
                disabled={prStatus === "creating"}
              />
            </div>

            {/* Target branch */}
            <div>
              <span className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1">
                Target Branch
              </span>
              <select
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className={inputCls}
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
            <div>
              <span className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1">
                Title
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                placeholder="PR title"
                disabled={prStatus === "creating"}
              />
            </div>

            {/* Description */}
            <div>
              <span className="block text-xs font-semibold uppercase text-text-ghost tracking-[0.8px] mb-1">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={cn(inputCls, "resize-none")}
                placeholder="Optional description..."
                disabled={prStatus === "creating"}
              />
            </div>

            {/* Prod confirmation step */}
            {isProd && showProdConfirm && prStatus !== "success" && (
              <div className="flex items-start gap-2 px-3 py-2 bg-error/15 border border-error/30 rounded text-error">
                <WarningIcon size={14} className="shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <p className="text-xs font-bold">
                    CONFIRM: Creating a PR on the PRODUCTION repo.
                  </p>
                  <p className="text-xs">
                    Type{" "}
                    <span className="font-mono font-bold bg-error/20 px-1 rounded">
                      CONFIRM
                    </span>{" "}
                    to proceed:
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type CONFIRM"
                    className="w-full px-2 py-1 text-xs bg-bg-base border border-error/30 rounded text-text-primary placeholder:text-text-ghost focus:outline-none focus:border-error"
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {prStatus === "error" && prError && (
              <div className="px-3 py-2 text-xs bg-error/10 border border-error/20 rounded text-error">
                {prError}
              </div>
            )}

            {/* Success */}
            {prStatus === "success" && prResult && (
              <div className="px-3 py-2 bg-sessions/10 border border-sessions/20 rounded text-sessions space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <CheckIcon size={14} />
                  <span>PR #{prResult.id} created</span>
                </div>
                <a
                  href={prResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-rooms hover:underline block"
                >
                  Open PR
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-default">
            <button
              onClick={closePrModal}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-all rounded"
            >
              {prStatus === "success" ? "Close" : "Cancel"}
            </button>
            {prStatus !== "success" && (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  "px-4 py-1.5 text-xs font-semibold rounded transition-all",
                  !canSubmit
                    ? "bg-border-default text-text-ghost cursor-not-allowed"
                    : isProd
                      ? "bg-error text-white hover:bg-error/90 active:scale-[0.98]"
                      : "bg-[#f59e0b] text-[#0a0a0a] hover:bg-[#fbbf24] active:scale-[0.98]",
                )}
              >
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

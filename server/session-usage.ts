import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

export interface SessionUsage {
  pid: number;
  sessionId: string;
  cwd: string;
  model: string;
  modelShort: "opus" | "sonnet" | "haiku" | "unknown";
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  totalTokens: number;
  startedAt: number;
  messageCount: number;
  contextUsed: number;
  contextTotal: number;
  contextPercent: number;
}

interface ClaudeSessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string;
  entrypoint: string;
}

interface JournalMessage {
  type?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

// Pricing per million tokens (USD)
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  opus: { input: 15, output: 75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheRead: 0.3 },
  haiku: { input: 0.25, output: 1.25, cacheRead: 0.025 },
};

// Context window sizes per model family
const CONTEXT_WINDOW: Record<string, number> = {
  opus: 1_000_000,
  sonnet: 1_000_000,
  haiku: 200_000,
  unknown: 200_000,
};

function detectModelShort(model: string): "opus" | "sonnet" | "haiku" | "unknown" {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "unknown";
}

function calculateCost(
  modelShort: "opus" | "sonnet" | "haiku" | "unknown",
  inputTokens: number,
  outputTokens: number,
  cacheCreation: number,
  cacheRead: number,
): number {
  const tier = PRICING[modelShort] ?? PRICING["sonnet"]!;
  const inputCost = ((inputTokens + cacheCreation) / 1_000_000) * tier.input;
  const outputCost = (outputTokens / 1_000_000) * tier.output;
  const cacheReadCost = (cacheRead / 1_000_000) * tier.cacheRead;
  return inputCost + outputCost + cacheReadCost;
}

/**
 * Find all Claude session files (~/.claude/sessions/*.json)
 * and return a map of PID -> session info.
 */
function readSessionFiles(): Map<number, ClaudeSessionFile> {
  const sessionsDir = join(homedir(), ".claude", "sessions");
  const map = new Map<number, ClaudeSessionFile>();

  if (!existsSync(sessionsDir)) return map;

  try {
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = readFileSync(join(sessionsDir, file), "utf-8");
        const data = JSON.parse(raw) as ClaudeSessionFile;
        if (data.pid && data.sessionId) {
          map.set(data.pid, data);
        }
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // Directory read failed
  }

  return map;
}

/**
 * Find the JSONL file for a given sessionId.
 * Searches all project directories under ~/.claude/projects/
 */
function findJsonlFile(sessionId: string): string | null {
  const projectsDir = join(homedir(), ".claude", "projects");
  if (!existsSync(projectsDir)) return null;

  try {
    const projectDirs = readdirSync(projectsDir);
    for (const dir of projectDirs) {
      const jsonlPath = join(projectsDir, dir, `${sessionId}.jsonl`);
      if (existsSync(jsonlPath)) {
        return jsonlPath;
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

// Cache to avoid re-reading entire JSONL files every poll
const usageCache = new Map<string, {
  byteOffset: number;
  usage: SessionUsage;
}>();

/**
 * Parse a JSONL file and sum up token usage from all assistant messages.
 * Uses a byte offset cache to only read new lines since last parse.
 */
function parseJsonlUsage(
  jsonlPath: string,
  pid: number,
  sessionId: string,
  cwd: string,
  startedAt: number,
): SessionUsage | null {
  try {
    const raw = readFileSync(jsonlPath, "utf-8");
    const cached = usageCache.get(sessionId);

    // If file hasn't changed size, return cached result
    if (cached && cached.byteOffset === raw.length) {
      return cached.usage;
    }

    // Determine where to start parsing
    const startOffset = cached?.byteOffset ?? 0;
    const newContent = startOffset > 0 ? raw.slice(startOffset) : raw;

    let totalInput = cached?.usage.totalInputTokens ?? 0;
    let totalOutput = cached?.usage.totalOutputTokens ?? 0;
    let cacheCreation = cached?.usage.cacheCreationTokens ?? 0;
    let cacheRead = cached?.usage.cacheReadTokens ?? 0;
    let messageCount = cached?.usage.messageCount ?? 0;
    let model = cached?.usage.model ?? "";
    // Track the last message's context usage for context window calculation
    let lastInputTokens = cached?.usage.contextUsed ?? 0;
    let lastCacheReadTokens = 0;

    const lines = newContent.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as JournalMessage;
        if (entry.type === "assistant" && entry.message?.usage) {
          const u = entry.message.usage;
          totalInput += u.input_tokens ?? 0;
          totalOutput += u.output_tokens ?? 0;
          cacheCreation += u.cache_creation_input_tokens ?? 0;
          cacheRead += u.cache_read_input_tokens ?? 0;
          messageCount++;
          // Track last message for context window size
          lastInputTokens = u.input_tokens ?? 0;
          lastCacheReadTokens = u.cache_read_input_tokens ?? 0;
          if (entry.message.model) {
            model = entry.message.model;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    const modelShort = detectModelShort(model);
    const totalCost = calculateCost(
      modelShort,
      totalInput,
      totalOutput,
      cacheCreation,
      cacheRead,
    );

    // Context = cache_read + input from the LAST message (approximation of current context size)
    const contextUsed = lastCacheReadTokens + lastInputTokens;
    const contextTotal = CONTEXT_WINDOW[modelShort] ?? CONTEXT_WINDOW["unknown"]!;
    const contextPercent = contextTotal > 0 ? Math.min(100, Math.round((contextUsed / contextTotal) * 100)) : 0;

    const usage: SessionUsage = {
      pid,
      sessionId,
      cwd,
      model,
      modelShort,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      cacheCreationTokens: cacheCreation,
      cacheReadTokens: cacheRead,
      totalCost,
      totalTokens: totalInput + totalOutput + cacheCreation + cacheRead,
      startedAt,
      messageCount,
      contextUsed,
      contextTotal,
      contextPercent,
    };

    usageCache.set(sessionId, { byteOffset: raw.length, usage });
    return usage;
  } catch {
    return null;
  }
}

/**
 * Get usage data for a specific PID.
 */
export function getSessionUsage(pid: number): SessionUsage | null {
  const sessionFiles = readSessionFiles();
  const sessionFile = sessionFiles.get(pid);
  if (!sessionFile) return null;

  const jsonlPath = findJsonlFile(sessionFile.sessionId);
  if (!jsonlPath) return null;

  return parseJsonlUsage(
    jsonlPath,
    pid,
    sessionFile.sessionId,
    sessionFile.cwd,
    sessionFile.startedAt,
  );
}

/**
 * Get usage data for all known sessions.
 */
export function getAllSessionUsage(): SessionUsage[] {
  const sessionFiles = readSessionFiles();
  const results: SessionUsage[] = [];

  for (const [pid, sessionFile] of sessionFiles) {
    const jsonlPath = findJsonlFile(sessionFile.sessionId);
    if (!jsonlPath) continue;

    const usage = parseJsonlUsage(
      jsonlPath,
      pid,
      sessionFile.sessionId,
      sessionFile.cwd,
      sessionFile.startedAt,
    );
    if (usage) {
      results.push(usage);
    }
  }

  return results;
}

/**
 * Get usage for a session by its session UUID (not PID).
 * Useful for matching managed sessions spawned by us.
 */
export function getUsageBySessionId(sessionId: string): SessionUsage | null {
  const jsonlPath = findJsonlFile(sessionId);
  if (!jsonlPath) return null;

  // Try to find the session file to get PID
  const sessionFiles = readSessionFiles();
  for (const [pid, sf] of sessionFiles) {
    if (sf.sessionId === sessionId) {
      return parseJsonlUsage(jsonlPath, pid, sessionId, sf.cwd, sf.startedAt);
    }
  }

  // No session file match, parse anyway with defaults
  return parseJsonlUsage(jsonlPath, 0, sessionId, "", Date.now());
}

/**
 * Look up a session's Claude session ID by the PID of the pty process.
 * Claude Code creates a session file matching the PID of the CLI process,
 * but our pty spawn creates a shell wrapper. We need to find child processes.
 */
export function findSessionIdForPtyPid(ptyPid: number): string | null {
  const sessionFiles = readSessionFiles();

  // Direct match first
  if (sessionFiles.has(ptyPid)) {
    return sessionFiles.get(ptyPid)!.sessionId;
  }

  // Try to find a session file whose PID is a child of ptyPid
  // by checking process tree via ps
  try {
    const raw = execSync(`pgrep -P ${ptyPid} 2>/dev/null || true`, {
      encoding: "utf-8",
      timeout: 2000,
    });
    const childPids = raw
      .trim()
      .split("\n")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    for (const childPid of childPids) {
      if (sessionFiles.has(childPid)) {
        return sessionFiles.get(childPid)!.sessionId;
      }
      // Go one more level deep
      try {
        const grandRaw = execSync(`pgrep -P ${childPid} 2>/dev/null || true`, {
          encoding: "utf-8",
          timeout: 2000,
        });
        const grandPids = grandRaw
          .trim()
          .split("\n")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        for (const gp of grandPids) {
          if (sessionFiles.has(gp)) {
            return sessionFiles.get(gp)!.sessionId;
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }

  return null;
}

/**
 * Format cost as a dollar string.
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return "$0.00";
  if (cost < 1) return `$${cost.toFixed(2)}`;
  if (cost < 10) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(1)}`;
}

/**
 * Format token count as a human-readable string.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

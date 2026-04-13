import { userInfo } from "node:os";
import { basename } from "node:path";

// ---------- Config ----------

export const DEMO_MODE = process.env.DEMO_MODE === "true";

const USERNAME = (() => {
  try {
    return userInfo().username;
  } catch {
    return "user";
  }
})();

const HOME_DIR = process.env.HOME ?? `/Users/${USERNAME}`;

// Replacement rules: applied in order
const RULES: Array<[RegExp, string]> = [
  // API keys and secrets
  [/sk-ant-[a-zA-Z0-9_-]{20,}/g, "sk-ant-****"],
  [/ANTHROPIC_API_KEY=[^\s'"]*/g, "ANTHROPIC_API_KEY=****"],
  [/sk-[a-zA-Z0-9]{20,}/g, "sk-****"],

  // Home directory (must come before username-only rules)
  [new RegExp(escapeRegex(HOME_DIR), "g"), "/Users/demo"],
  [new RegExp(`/Users/${escapeRegex(USERNAME)}`, "g"), "/Users/demo"],
  [new RegExp(`/home/${escapeRegex(USERNAME)}`, "g"), "/home/demo"],

  // Hostname in prompts (user@hostname)
  [new RegExp(`${escapeRegex(USERNAME)}@\\S+`, "g"), "demo@studio"],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- Sanitizer ----------

export function sanitize(text: string): string {
  if (!DEMO_MODE) return text;
  let out = text;
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement);
    // Reset lastIndex for global regexes (they're stateful)
    pattern.lastIndex = 0;
  }
  return out;
}

/** Sanitize a session name */
export function sanitizeName(name: string): string {
  if (!DEMO_MODE) return name;
  return sanitize(name);
}

/** Sanitize a file path */
export function sanitizePath(path: string): string {
  if (!DEMO_MODE) return path;
  return sanitize(path);
}

/** Sanitize a repo object's display fields (mutates in place for performance) */
export function sanitizeRepoStatus<T extends { name?: string; path?: string; branch?: string }>(
  repo: T,
): T {
  if (!DEMO_MODE) return repo;
  if (repo.path) repo.path = sanitizePath(repo.path);
  if (repo.name) repo.name = sanitize(repo.name);
  return repo;
}

/** Sanitize a CWD shown in the working directory for sessions listing */
export function sanitizeCwd(cwd: string | undefined): string | undefined {
  if (!DEMO_MODE || !cwd) return cwd;

  // Replace the real home path with /Users/demo
  let out = cwd;
  if (out.startsWith(HOME_DIR)) {
    out = "/Users/demo" + out.slice(HOME_DIR.length);
  }
  return out;
}

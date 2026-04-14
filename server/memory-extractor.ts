/**
 * Memory auto-extraction: extracts structured learnings from session
 * transcripts using Claude Haiku via the `claude` CLI.
 *
 * @module server/memory-extractor
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/** A single extracted memory entry. */
export interface ExtractedMemory {
  title: string;
  category: "learning" | "correction" | "decision";
  content: {
    observation: string;
    action: string;
    outcome: string;
    lesson: string;
  };
  tags: string[];
  source: "auto-extract";
  sourceAgent?: string;
  sourceSessionId?: string;
}

const EXTRACTION_PROMPT = `Given this session transcript, extract 0-3 key learnings that would be useful for future sessions. Each learning should capture:
- What was discovered or what problem was encountered
- What action was taken
- What the outcome was
- What to remember next time

Return a JSON array (no markdown, no explanation). Each element:
{"title": "short title", "category": "learning"|"correction"|"decision", "observation": "what was found", "action": "what was done", "outcome": "what happened", "lesson": "what to remember", "tags": ["tag1", "tag2"]}

If no meaningful learnings, return an empty array: []

Session transcript:
`;

/**
 * Extract structured memory entries from a session transcript.
 *
 * Uses `claude -p --model haiku` to analyze the transcript and extract
 * 0-3 structured learnings. Returns an empty array on failure or if
 * no learnings are found.
 *
 * @param sessionTranscript - The terminal output text from the session
 * @param filesDiff - Optional git diff showing file changes during the session
 * @param opts - Optional metadata to attach to extracted memories
 */
export async function extractMemories(
  sessionTranscript: string,
  filesDiff?: string,
  opts?: { agentName?: string; sessionId?: string },
): Promise<ExtractedMemory[]> {
  // Skip extraction for trivial sessions
  const trimmed = sessionTranscript.trim();
  if (trimmed.length < 100) return [];

  // Build the input — truncate to avoid token limits
  const maxTranscript = 8000;
  const maxDiff = 2000;
  let input = EXTRACTION_PROMPT;
  input +=
    trimmed.length > maxTranscript
      ? trimmed.slice(-maxTranscript) + "\n[...truncated earlier output...]"
      : trimmed;

  if (filesDiff && filesDiff.trim().length > 0) {
    const diffTrimmed = filesDiff.trim().slice(0, maxDiff);
    input += `\n\nFile changes during session:\n${diffTrimmed}`;
  }

  try {
    // Use claude CLI in print mode with haiku for fast extraction
    const { stdout } = await execAsync(
      `echo ${JSON.stringify(input)} | claude -p --model haiku --output-format json`,
      {
        encoding: "utf-8",
        timeout: 15_000, // 15 second timeout — haiku is fast
        maxBuffer: 1024 * 1024,
      },
    );

    // Parse the JSON response — claude with --output-format json wraps the response
    const parsed = JSON.parse(stdout.trim());

    // The response could be the array directly or wrapped in a result field
    let rawEntries: unknown[];
    if (Array.isArray(parsed)) {
      rawEntries = parsed;
    } else if (parsed?.result && Array.isArray(parsed.result)) {
      rawEntries = parsed.result;
    } else if (typeof parsed === "object" && parsed !== null) {
      // Try to find an array in the response
      const firstArrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
      if (firstArrayKey) {
        rawEntries = parsed[firstArrayKey] as unknown[];
      } else {
        return [];
      }
    } else {
      return [];
    }

    // Validate and transform entries
    return rawEntries
      .slice(0, 3)
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && "title" in entry,
      )
      .map((entry) => ({
        title: String(entry.title ?? "Untitled learning"),
        category: (["learning", "correction", "decision"].includes(String(entry.category))
          ? String(entry.category)
          : "learning") as ExtractedMemory["category"],
        content: {
          observation: String(entry.observation ?? ""),
          action: String(entry.action ?? ""),
          outcome: String(entry.outcome ?? ""),
          lesson: String(entry.lesson ?? ""),
        },
        tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
        source: "auto-extract" as const,
        sourceAgent: opts?.agentName,
        sourceSessionId: opts?.sessionId,
      }));
  } catch {
    // Extraction failed — that's fine, not every session has learnings
    return [];
  }
}

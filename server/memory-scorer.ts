/**
 * BM25 relevance scoring for memory injection.
 *
 * Scores memory entries against a query (session context) to find the
 * most relevant memories to inject into a new session. No external
 * dependencies — BM25 is ~50 lines of code.
 *
 * @module server/memory-scorer
 */

/** A memory entry from the index with its text fields. */
export interface ScoredMemoryInput {
  file: string;
  title: string;
  key_point?: string;
  tags?: string[];
  category?: string;
  agent_type?: string;
  pinned?: boolean;
}

/** A scored memory entry, ready for injection. */
export interface ScoredMemory extends ScoredMemoryInput {
  score: number;
}

// ---------------------------------------------------------------------------
// BM25 implementation
// ---------------------------------------------------------------------------

/** Standard BM25 parameters */
const K1 = 1.2;
const B = 0.75;

/** Tokenize text into lowercase terms, stripping punctuation. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Build a combined text string from a memory entry's fields. */
function memoryToText(entry: ScoredMemoryInput): string {
  const parts = [entry.title, entry.key_point ?? "", ...(entry.tags ?? []), entry.category ?? ""];
  return parts.join(" ");
}

/**
 * Score memories against a query using BM25 text relevance.
 *
 * @param query - The session context string (agent description + project path + working dir)
 * @param memories - All available memory entries from the index
 * @param topN - Number of top results to return (default 5)
 * @returns Sorted array of top N scored memories, highest score first
 */
export function scoreMemories(
  query: string,
  memories: ScoredMemoryInput[],
  topN = 5,
): ScoredMemory[] {
  if (memories.length === 0 || !query.trim()) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Tokenize all documents
  const docs = memories.map((m) => tokenize(memoryToText(m)));

  // Compute average document length
  const avgDl = docs.reduce((sum, d) => sum + d.length, 0) / docs.length;
  const N = docs.length;

  // Compute IDF for each query term
  // IDF = ln((N - df + 0.5) / (df + 0.5) + 1)
  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    if (idf.has(term)) continue;
    const df = docs.filter((d) => d.includes(term)).length;
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  // Score each document
  const scored: ScoredMemory[] = memories.map((entry, i) => {
    const doc = docs[i]!;
    const dl = doc.length;
    let score = 0;

    for (const term of queryTerms) {
      const tf = doc.filter((t) => t === term).length;
      const termIdf = idf.get(term) ?? 0;
      // BM25 formula
      score += termIdf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (dl / avgDl))));
    }

    // Boost pinned entries slightly
    if (entry.pinned) score *= 1.3;

    return { ...entry, score };
  });

  // Sort by score descending, return top N with score > 0
  return scored
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

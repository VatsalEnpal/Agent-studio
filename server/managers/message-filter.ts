// server/managers/message-filter.ts

/** Tool usage extracted from stream events for activity indicators. */
export interface ToolActivity {
  name: string;
  input: Record<string, unknown>;
}

/** The final processed result emitted once per agent turn. */
export interface FilteredResult {
  text: string;
  toolsUsed: ToolActivity[];
  durationMs: number;
}

/** Callbacks fired at different stages of stream processing. */
export interface FilterCallbacks {
  /** Fired once when the agent starts generating. */
  onTypingStart: () => void;
  /** Fired for each tool invocation (name + first arg only). */
  onActivity: (tool: ToolActivity) => void;
  /** Fired once when the turn completes with the accumulated text. */
  onResult: (result: FilteredResult) => void;
  /** Fired on timeout, cancellation, or unrecoverable stream error. */
  onError: (error: Error) => void;
}

/** Shape of a single streaming event from the Claude Agent SDK. */
interface StreamEvent {
  type: string;
  event?: {
    type: string;
    delta?: {
      type: string;
      text?: string;
    };
    content_block?: {
      type: string;
      name?: string;
      input?: Record<string, unknown>;
    };
  };
  subtype?: string;
  result?: string;
  session_id?: string;
}

/** Maximum time (ms) to wait for a turn to complete before error. */
const TURN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Processes a Claude Agent SDK conversation stream, filtering events to produce
 * a single clean text result per turn.
 *
 * - Drops thinking events entirely
 * - Drops tool_use/tool_result from client output
 * - Extracts tool name + first arg for activity indicator (sends via onActivity)
 * - Accumulates text_delta events silently on the server
 * - On turn_end: emits ONE message via onResult with full accumulated text
 * - Supports AbortController for cancellation
 * - Has 5-minute timeout (if turn never ends, calls onError)
 *
 * @param agentId - Identifier of the agent being processed
 * @param conversation - Async iterable of SDK stream events
 * @param callbacks - Lifecycle callbacks
 * @param signal - Optional AbortSignal for cancellation
 */
export async function processStreamEvents(
  agentId: string,
  conversation: AsyncIterable<StreamEvent>,
  callbacks: FilterCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const startTime = Date.now();
  let accumulatedText = "";
  const toolsUsed: ToolActivity[] = [];
  let typingStarted = false;

  // 5-minute hard timeout
  const timeoutTimer = setTimeout(() => {
    callbacks.onError(
      new Error(`Agent ${agentId} turn timed out after ${TURN_TIMEOUT_MS}ms`),
    );
  }, TURN_TIMEOUT_MS);

  // Abort handler
  const onAbort = (): void => {
    clearTimeout(timeoutTimer);
    callbacks.onError(
      new Error(`Agent ${agentId} stream cancelled via AbortController`),
    );
  };

  if (signal?.aborted) {
    clearTimeout(timeoutTimer);
    callbacks.onError(new Error(`Agent ${agentId} stream already aborted`));
    return;
  }

  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const message of conversation) {
      // Check abort between iterations
      if (signal?.aborted) {
        break;
      }

      if (message.type === "stream_event") {
        const event = message.event;
        if (!event) continue;

        // Drop thinking events entirely
        if (event.type === "thinking" || event.delta?.type === "thinking_delta") {
          continue;
        }

        // Extract tool activity (name + first arg) for UI indicator
        if (
          event.type === "content_block_start" &&
          event.content_block?.type === "tool_use" &&
          event.content_block.name
        ) {
          const activity: ToolActivity = {
            name: event.content_block.name,
            input: extractFirstArg(event.content_block.input),
          };
          toolsUsed.push(activity);
          callbacks.onActivity(activity);
          continue;
        }

        // Drop tool_use deltas and tool_result events from client output
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "input_json_delta"
        ) {
          continue;
        }

        // Accumulate text_delta events silently
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          event.delta.text
        ) {
          if (!typingStarted) {
            typingStarted = true;
            callbacks.onTypingStart();
          }
          accumulatedText += event.delta.text;
        }
      }

      // On result: emit accumulated text
      if (message.type === "result") {
        clearTimeout(timeoutTimer);
        signal?.removeEventListener("abort", onAbort);

        const durationMs = Date.now() - startTime;
        const finalText =
          message.subtype === "success"
            ? (message.result ?? accumulatedText)
            : accumulatedText;

        callbacks.onResult({
          text: finalText,
          toolsUsed,
          durationMs,
        });
        return;
      }
    }

    // Stream ended without a result message — still emit what we have
    clearTimeout(timeoutTimer);
    signal?.removeEventListener("abort", onAbort);

    if (signal?.aborted) {
      return; // onAbort already called onError
    }

    callbacks.onResult({
      text: accumulatedText,
      toolsUsed,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    clearTimeout(timeoutTimer);
    signal?.removeEventListener("abort", onAbort);
    callbacks.onError(
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

/**
 * Extract just the first key-value pair from a tool input object
 * for a compact activity indicator (e.g. `{ file_path: "src/foo.ts" }`).
 */
function extractFirstArg(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const keys = Object.keys(input);
  if (keys.length === 0) return {};
  const firstKey = keys[0];
  return { [firstKey]: input[firstKey] };
}

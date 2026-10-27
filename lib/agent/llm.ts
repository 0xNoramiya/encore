import { anthropic } from "@ai-sdk/anthropic";

// Sonnet 5.5 can't fully disable thinking and warns on every call; the fallback is what we want.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

/** The configured chat model. Provider is swappable here; the model id comes from LLM_MODEL. */
export function llm() {
  return anthropic(process.env.LLM_MODEL ?? "claude-sonnet-5-5");
}

/**
 * For short, well-specified calls (narration, structured plans) where code
 * already enforces correctness: ask for the least thinking the model allows so
 * the caregiver waits less. Token limits still leave headroom for it.
 */
export const noThinking = { anthropic: { thinking: { type: "disabled" as const } } };

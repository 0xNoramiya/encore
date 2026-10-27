import type { AgentStep } from "../profiles";
import type { Learned } from "../sessions";

/** NDJSON events streamed from /api/agent/* to the browser. */
export type AgentEvent =
  | { t: "run"; runId: string }
  | { t: "step"; step: AgentStep }
  | { t: "thought"; id: string; delta: string }
  | { t: "learned"; learned: Learned }
  | { t: "done"; summary: string | null; itemCount: number }
  | { t: "error"; message: string };

export function ndjsonStream(run: (emit: (e: AgentEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const emit = (e: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // Client went away; the run keeps going and persists its result.
          open = false;
        }
      };
      try {
        await run(emit);
      } catch (err) {
        console.error("agent run failed", err);
        emit({ t: "error", message: "Something went wrong while building. Please try again." });
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

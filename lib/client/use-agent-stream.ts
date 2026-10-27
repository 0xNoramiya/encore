"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/events";
import type { AgentStep } from "@/lib/profiles";
import type { Learned } from "@/lib/sessions";

export type StreamStatus = "idle" | "running" | "done" | "error";

/** POSTs to an /api/agent/* route and folds the NDJSON event stream into steps. */
export function useAgentStream(url: string) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [learned, setLearned] = useState<Learned | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const busy = useRef(false);

  const apply = useCallback((e: AgentEvent) => {
    if (e.t === "run") {
      setRunId(e.runId);
    } else if (e.t === "step") {
      setSteps((prev) => {
        const i = prev.findIndex((s) => s.id === e.step.id);
        if (i < 0) return [...prev, e.step];
        const next = prev.slice();
        next[i] = e.step;
        return next;
      });
    } else if (e.t === "thought") {
      setSteps((prev) => {
        const i = prev.findIndex((s) => s.id === e.id);
        if (i < 0) return [...prev, { id: e.id, kind: "thought", label: e.delta, status: "done" }];
        const next = prev.slice();
        next[i] = { ...next[i], label: next[i].label + e.delta };
        return next;
      });
    } else if (e.t === "learned") {
      setLearned(e.learned);
    } else if (e.t === "done") {
      setSummary(e.summary);
      setStatus("done");
    } else if (e.t === "error") {
      setError(e.message);
      setStatus("error");
    }
  }, []);

  const start = useCallback(
    async (body: unknown) => {
      if (busy.current) return;
      busy.current = true;
      setSteps([]);
      setError(null);
      setStatus("running");
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok || !res.body) {
          const msg = (await res.json().catch(() => null))?.error ?? "Encore couldn't start. Please try again.";
          setError(msg);
          setStatus(res.status === 409 ? "running" : "error");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) apply(JSON.parse(line) as AgentEvent);
        }
        setStatus((s) => (s === "running" ? "done" : s));
      } catch {
        setError("The connection dropped. Refresh to see what Encore saved.");
        setStatus("error");
      } finally {
        busy.current = false;
      }
    },
    [url, apply],
  );

  return { steps, status, error, summary, learned, runId, start };
}

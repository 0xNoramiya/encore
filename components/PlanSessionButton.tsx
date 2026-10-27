"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanSessionButton({ profileId, label, className }: { profileId: string; label: string; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function plan() {
    setState("busy");
    const res = await fetch("/api/agent/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Encore couldn’t plan a session. Please try again.");
      setState("error");
      return;
    }
    router.push(`/s/${body.sessionId}`);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={plan} disabled={state === "busy"} className={className ?? "rounded-full bg-accent px-7 py-3.5 text-lg font-bold text-paper disabled:opacity-60"}>
        {state === "busy" ? "Planning the session…" : label}
      </button>
      {state === "busy" && <p className="text-sm text-muted">Choosing an arc and writing gentle prompts. About 15 seconds.</p>}
      {error && (
        <p className="text-sm text-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

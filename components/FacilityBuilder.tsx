"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAgentStream } from "@/lib/client/use-agent-stream";
import { TraceTimeline } from "./TraceTimeline";

interface Resident {
  id: string;
  firstName: string;
  birthYear: number;
  hometown: string;
  seeds: string[];
}

export function FacilityBuilder({ residents }: { residents: Resident[] }) {
  const router = useRouter();
  const build = useAgentStream("/api/groups");
  const [selected, setSelected] = useState<string[]>(residents.slice(0, 3).map((r) => r.id));
  const [name, setName] = useState("Thursday afternoon group");
  const running = build.status === "running";

  useEffect(() => {
    // The groups stream announces the new group's id as its run id.
    if (build.status === "done" && build.runId) router.push(`/p/${build.runId}`);
  }, [build.status, build.runId, router]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 5 ? s : [...s, id]));

  return (
    <div className="flex flex-col gap-8">
      <fieldset disabled={running}>
        <legend className="mb-4 font-display text-2xl">Who is joining?</legend>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {residents.map((r) => {
            const on = selected.includes(r.id);
            return (
              <li key={r.id}>
                <label className={`flex min-h-24 cursor-pointer gap-3 rounded-lg border p-4 ${on ? "border-accent bg-accent-soft" : "border-ink/15 bg-card hover:border-ink/40"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
                  <span>
                    <span className="block font-display text-xl">{r.firstName}</span>
                    <span className="block text-sm text-muted">
                      Born {r.birthYear}, {r.hometown.split(",")[0]}
                    </span>
                    <span className="mt-1 block text-sm text-ink/80">{r.seeds.slice(0, 3).join(", ")}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          Choose 2 to 5 people. {selected.length} selected.
        </p>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-96">
          <label htmlFor="group-name" className="mb-1.5 block font-bold">
            Group name
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            disabled={running}
            className="w-full rounded-md border border-ink/25 bg-card px-4 py-3 text-lg"
          />
        </div>
        <button
          type="button"
          disabled={running || selected.length < 2 || !name.trim()}
          onClick={() => build.start({ name: name.trim(), memberIds: selected })}
          className="rounded-full bg-accent px-7 py-3.5 text-lg font-bold text-paper disabled:opacity-50"
        >
          {running ? "Finding common ground…" : "Build a group session"}
        </button>
      </div>

      {(running || build.steps.length > 0 || build.status === "error") && (
        <section className="rounded-lg border border-rule bg-card px-5 py-6 sm:px-8" aria-live="polite">
          <h2 className="font-display text-2xl">{build.status === "error" ? "The group build stopped" : "Finding what this group shares"}</h2>
          {build.error && <p className="mt-1 text-ink">{build.error}</p>}
          <div className="mt-4">
            <TraceTimeline steps={build.steps} live />
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GenericPlan } from "@/lib/agent/generic";
import { compareSessions, flagMemoryTests } from "@/lib/compare";
import type { EraWindow } from "@/lib/era";
import type { SessionItem, SessionPlan } from "@/lib/session";
import { Provenance } from "./Provenance";

export const KIND_LABEL: Record<SessionItem["kind"], string> = {
  song: "Song",
  film_clip: "Film clip",
  tv_clip: "TV clip",
  place: "Place",
  food: "Taste of home",
  book: "Book",
};

interface Props {
  sessionId: string;
  profileId: string;
  firstName: string;
  plan: SessionPlan;
  canEdit: boolean;
  started: boolean;
  window: EraWindow;
  seeds: string[];
  seedIds: string[];
}

function Thumb({ item }: { item: SessionItem }) {
  const shape = item.kind === "song" ? "aspect-square" : item.kind === "place" || item.kind === "food" ? "aspect-[4/3]" : "aspect-[2/3]";
  return item.media.image ? (
    <img src={item.media.image} alt="" className={`${shape} w-20 shrink-0 rounded object-cover sm:w-24`} />
  ) : (
    <div className={`${shape} w-20 shrink-0 rounded bg-ink sm:w-24`} aria-hidden />
  );
}

function EncoreList({ items, firstName, editable, onMove, onRemove }: { items: SessionItem[]; firstName: string; editable: boolean; onMove?: (i: number, d: -1 | 1) => void; onRemove?: (i: number) => void }) {
  return (
    <ol className="flex flex-col divide-y divide-rule">
      {items.map((item, i) => (
        <li key={item.entityId} className="flex gap-4 py-5">
          <span className="w-6 shrink-0 pt-1 font-display text-2xl text-accent tabular-nums">{i + 1}</span>
          <Thumb item={item} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">
              {KIND_LABEL[item.kind]}
              {item.year ? `, ${item.year}` : ""}
            </p>
            <h3 className="font-display text-xl leading-snug">
              {item.title}
              {item.media.song && <span className="font-sans text-base text-muted"> · “{item.media.song}”</span>}
            </h3>
            <p className="mt-1.5 max-w-[60ch] font-display italic text-ink/85">“{item.prompt}”</p>
            <div className="mt-2">
              {item.why.seedNames.length ? (
                <Provenance why={item.why.seedNames.map((name, k) => ({ entityId: name, name, score: item.why.scores[k] }))} firstName={firstName} compact />
              ) : (
                <p className="text-xs text-muted">One of the things you told us {firstName} loved</p>
              )}
            </div>
            {editable && (
              <div className="mt-1 flex gap-4 text-sm font-bold [&>button]:min-h-11 [&>button]:px-1">
                <button type="button" disabled={i === 0} onClick={() => onMove?.(i, -1)} className="text-ink/70 hover:text-ink disabled:opacity-30">
                  Move up
                </button>
                <button type="button" disabled={i === items.length - 1} onClick={() => onMove?.(i, 1)} className="text-ink/70 hover:text-ink disabled:opacity-30">
                  Move down
                </button>
                <button type="button" disabled={items.length <= 3} onClick={() => onRemove?.(i)} className="text-ink/70 hover:text-ink disabled:opacity-30">
                  Remove
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Comparison({ generic, plan, firstName, window, seeds, seedIds }: { generic: GenericPlan; plan: SessionPlan; firstName: string; window: EraWindow; seeds: string[]; seedIds: string[] }) {
  const rows = compareSessions(generic, plan, seeds, seedIds, window, firstName);
  return (
    <div>
      <table className="mb-10 w-full border-collapse text-left">
        <caption className="sr-only">Generic AI compared with Encore</caption>
        <thead>
          <tr className="border-b-2 border-ink text-sm">
            <th className="py-2 pr-4 font-normal text-muted" scope="col">
              Same intake, same model
            </th>
            <th className="w-28 py-2 pr-4 font-bold sm:w-40" scope="col">
              Generic AI
            </th>
            <th className="w-28 py-2 font-bold text-accent sm:w-40" scope="col">
              Encore
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-rule">
              <th scope="row" className="py-3 pr-4 font-normal">
                {r.label}
              </th>
              <td className="py-3 pr-4 tabular-nums">{r.generic}</td>
              <td className={`py-3 tabular-nums ${r.encoreBetter ? "font-bold text-accent" : ""}`}>{r.encore}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h3 className="font-display text-2xl">Generic AI</h3>
          <p className="mb-2 text-sm text-muted">The model alone, no tools, no taste graph. Highlighted lines ask {firstName} to remember, which the clinical guidance says to avoid.</p>
          <ol className="flex flex-col divide-y divide-rule">
            {generic.items.map((g, i) => (
              <li key={i} className="flex gap-4 py-5">
                <span className="w-6 shrink-0 pt-1 font-display text-2xl text-ink/60 tabular-nums">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm text-muted">
                    {KIND_LABEL[g.kind]}
                    {g.year ? `, ${g.year}` : ""}
                  </p>
                  <h4 className="font-display text-xl leading-snug">
                    {g.title}
                    {g.creator && <span className="font-sans text-base text-muted"> · {g.creator}</span>}
                  </h4>
                  <p className="mt-1.5 font-display italic text-ink/85">
                    “
                    {flagMemoryTests(g.prompt).map((seg, k) =>
                      seg.flagged ? (
                        <mark key={k} className="bg-accent-soft text-ink underline decoration-accent decoration-2 underline-offset-4">
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={k}>{seg.text}</span>
                      ),
                    )}
                    ”
                  </p>
                  <p className="mt-2 text-xs text-muted">No source</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="font-display text-2xl text-accent">Encore</h3>
          <p className="mb-2 text-sm text-muted">Built outward from {firstName}’s memories through Qloo, scoped to {window.start}–{window.end} and home. Every pick shows where it came from.</p>
          <EncoreList items={plan.items} firstName={firstName} editable={false} />
        </section>
      </div>
    </div>
  );
}

export function SessionPreview({ sessionId, profileId, firstName, plan: initial, canEdit, started, window, seeds, seedIds }: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState(initial);
  const [mode, setMode] = useState<"plan" | "compare">("plan");
  const [generic, setGeneric] = useState<GenericPlan | null>(null);
  const [genericState, setGenericState] = useState<"idle" | "loading" | "error">("idle");
  const minutes = Math.round(plan.items.reduce((n, i) => n + i.durationSec, 0) / 60);

  async function save(items: SessionItem[]) {
    setPlan({ ...plan, items });
    await fetch(`/api/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: items.map((i) => i.entityId) }) });
  }

  async function showCompare() {
    setMode("compare");
    if (generic || genericState === "loading") return;
    setGenericState("loading");
    const res = await fetch("/api/agent/generic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setGeneric(body.plan);
      setGenericState("idle");
    } else setGenericState("error");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <Link href={`/p/${profileId}`} className="text-sm font-bold text-muted hover:text-ink">
        Back to {firstName}’s world
      </Link>
      <div className="mt-4 grid gap-6 pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-muted">
            Today’s session for {firstName}: {plan.items.length} items, about {minutes} minutes
          </p>
          <h1 className="mt-1 font-display text-5xl leading-tight">{plan.title}</h1>
          <p className="mt-3 max-w-[62ch] text-lg text-ink/85">{plan.intro}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: true }) });
              router.push(`/s/${sessionId}/play`);
            }}
            className="rounded-full bg-accent px-8 py-4 text-lg font-bold text-paper"
          >
            {started ? "Continue session" : "Start session"}
          </button>
        )}
      </div>

      <div role="group" aria-label="View" className="mb-2 inline-flex flex-wrap rounded-full border border-ink/20 p-1">
        <button type="button" aria-pressed={mode === "plan"} onClick={() => setMode("plan")} className={`min-h-11 rounded-full px-5 py-2 font-bold ${mode === "plan" ? "bg-ink text-paper" : "text-ink"}`}>
          Encore’s plan
        </button>
        <button type="button" aria-pressed={mode === "compare"} onClick={showCompare} className={`min-h-11 rounded-full px-5 py-2 font-bold ${mode === "compare" ? "bg-ink text-paper" : "text-ink"}`}>
          Compare with a generic AI
        </button>
      </div>

      <div className="border-t border-rule pt-4">
        {mode === "plan" && (
          <EncoreList
            items={plan.items}
            firstName={firstName}
            editable={canEdit && !started}
            onMove={(i, d) => {
              const items = plan.items.slice();
              [items[i], items[i + d]] = [items[i + d], items[i]];
              save(items);
            }}
            onRemove={(i) => save(plan.items.filter((_, k) => k !== i))}
          />
        )}
        {mode === "compare" && genericState === "loading" && (
          <p className="py-10 text-lg text-muted" aria-live="polite">
            Asking the same model, without Qloo, to plan a session from the same intake…
          </p>
        )}
        {mode === "compare" && genericState === "error" && <p className="py-10 text-lg">The comparison couldn’t be generated right now. Try again in a moment.</p>}
        {mode === "compare" && generic && <Comparison generic={generic} plan={plan} firstName={firstName} window={window} seeds={seeds} seedIds={seedIds} />}
      </div>

      <p className="mt-10 rounded-lg bg-card px-5 py-4 text-sm text-muted">
        For food items, follow {firstName}’s diet and texture plan. Stop whenever {firstName} seems tired or upset; a short session that ends well is better than a long one.
      </p>
    </main>
  );
}

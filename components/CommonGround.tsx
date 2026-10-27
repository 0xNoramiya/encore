"use client";

import { useState } from "react";
import type { CommonGroundResult } from "@/lib/agent/common-ground";
import { typeLabel } from "@/lib/domains";

const input = "w-full rounded-md border border-ink/25 bg-card px-4 py-3 text-lg text-ink placeholder:text-muted/70";

export function CommonGround({ profileId, firstName }: { profileId: string; firstName: string }) {
  const [loves, setLoves] = useState(["", "", ""]);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommonGroundResult | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    const list = loves.map((l) => l.trim()).filter(Boolean);
    if (!list.length) return;
    setState("busy");
    setError(null);
    const res = await fetch("/api/agent/common-ground", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId, loves: list }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Something went wrong. Please try again.");
      setState("error");
      return;
    }
    setResult(body);
    setState("idle");
  }

  return (
    <section className="border-t border-rule py-10">
      <h2 className="font-display text-3xl">Common ground</h2>
      <p className="mt-2 max-w-[62ch] text-muted">
        What do you love? Add up to three of your own favourites, and Encore compares your taste with {firstName}’s to find things you can enjoy together.
      </p>
      <form onSubmit={find} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        {loves.map((v, i) => (
          <div key={i}>
            <label htmlFor={`cg-${i}`} className="sr-only">
              Your favourite {i + 1}
            </label>
            <input
              id={`cg-${i}`}
              className={input}
              value={v}
              onChange={(e) => setLoves((l) => l.map((x, k) => (k === i ? e.target.value : x)))}
              placeholder={["A singer you love", "A film you love", "A show you love"][i]}
              autoComplete="off"
            />
          </div>
        ))}
        <button type="submit" disabled={state === "busy" || !loves.some((l) => l.trim())} className="rounded-full bg-ink px-6 py-3 text-lg font-bold text-paper disabled:opacity-40">
          {state === "busy" ? "Comparing…" : "Find common ground"}
        </button>
      </form>
      {error && (
        <p className="mt-3 text-ink" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-8" aria-live="polite">
          <p className="text-sm text-muted">
            Encore read your favourites as {result.mine.map((m) => `${m.name}${m.year && m.type !== "urn:entity:artist" ? ` (${m.year})` : ""}`).join(", ")}. {result.calls} Qloo calls.
          </p>
          {result.shared.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-bold">You both lean toward</span>
              {result.shared.map((t) => (
                <span key={t.name} className="rounded-full bg-accent-soft px-3 py-1 text-sm">
                  {t.name}
                </span>
              ))}
            </div>
          )}
          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-4">
            {result.picks.map((p) => (
              <article key={p.id} className="flex flex-col gap-2">
                {p.image ? (
                  <img src={p.image} alt="" className={`${p.type === "urn:entity:artist" ? "aspect-square" : "aspect-[2/3]"} w-full rounded-md bg-rule object-cover`} />
                ) : (
                  <div className="aspect-square w-full rounded-md bg-ink" aria-hidden />
                )}
                <p className="text-xs text-muted">
                  {typeLabel(p.type)}
                  {p.year ? `, ${p.year}` : ""}
                  {p.both ? ", for both of you" : ""}
                </p>
                <h3 className="font-display text-lg leading-snug">{p.name}</h3>
                <p className="text-xs text-ink/80">
                  From{" "}
                  {[p.drivers.find((d) => d.side === "them"), p.drivers.find((d) => d.side === "you")]
                    .filter((d) => d !== undefined)
                    .map((d) => (d.side === "you" ? `your ${d.name}` : `${firstName}’s ${d.name}`))
                    .join(" and ")}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

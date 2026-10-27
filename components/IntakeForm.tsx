"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEED_KINDS, typeLabel, type SeedKind } from "@/lib/domains";

interface Candidate {
  id: string;
  name: string;
  type: string;
  year: number | null;
  image: string | null;
  description: string | null;
}

interface Locality {
  id: string;
  name: string;
  label: string;
  filmCountry: string | null;
  lat: number | null;
  lon: number | null;
}

type Love =
  | { key: string; raw: string; kind: Exclude<SeedKind, "food">; state: "loading" | "ready" | "empty" | "error"; candidates: Candidate[]; selected: string | null }
  | { key: string; raw: string; kind: "food"; state: "loading" | "ready" | "error"; tag: { id: string; name: string } | null };

const AVOID_SUGGESTIONS = ["War footage", "Horror", "Sad endings", "Loud crowds"];

const input =
  "w-full rounded-md border border-ink/25 bg-card px-4 py-3 text-lg text-ink placeholder:text-muted/70 focus:border-ink focus-visible:outline-offset-0";
const label = "mb-1.5 block font-bold text-ink";

function Field({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function CandidateTile({ c, selected, onPick }: { c: Candidate; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`flex min-h-16 items-center gap-3 rounded-md border p-2 text-left transition-colors ${
        selected ? "border-accent bg-accent-soft" : "border-ink/15 bg-card hover:border-ink/40"
      }`}
    >
      {c.image ? (
        <img src={c.image} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded bg-rule" aria-hidden />
      )}
      <span className="min-w-0">
        <span className="line-clamp-2 font-bold leading-snug text-ink">{c.name}</span>
        <span className="block text-sm text-muted">
          {typeLabel(c.type)}
          {c.year && c.type !== "urn:entity:artist" ? `, ${c.year}` : ""}
        </span>
      </span>
    </button>
  );
}

export function IntakeForm() {
  const router = useRouter();
  const ids = useId();
  const [firstName, setFirstName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [townQuery, setTownQuery] = useState("");
  const [towns, setTowns] = useState<Locality[]>([]);
  const [townLoading, setTownLoading] = useState(false);
  const [town, setTown] = useState<Locality | null>(null);
  const [filmCountry, setFilmCountry] = useState("");
  const [languages, setLanguages] = useState("");
  const [loveText, setLoveText] = useState("");
  const [loveKind, setLoveKind] = useState<SeedKind>("any");
  const [loves, setLoves] = useState<Love[]>([]);
  const [avoidText, setAvoidText] = useState("");
  const [avoid, setAvoid] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const counter = useRef(0);

  const year = Number(birthYear);
  const validYear = Number.isInteger(year) && year >= 1915 && year <= new Date().getFullYear() - 40;

  useEffect(() => {
    if (town || townQuery.trim().length < 2) return;
    const t = setTimeout(async () => {
      setTownLoading(true);
      try {
        const res = await fetch(`/api/locality?q=${encodeURIComponent(townQuery.trim())}`);
        setTowns(((await res.json()) as { localities?: Locality[] }).localities ?? []);
      } finally {
        setTownLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [townQuery, town]);

  const townOptions = town || townQuery.trim().length < 2 ? [] : towns;

  function pickTown(l: Locality) {
    setTown(l);
    setTownQuery(l.label);
    if (l.filmCountry) setFilmCountry(l.filmCountry);
  }

  async function addLove() {
    const raw = loveText.trim();
    if (!raw || loves.length >= 8) return;
    const key = `love-${counter.current++}`;
    const kind = loveKind;
    setLoveText("");
    if (kind === "food") setLoves((l) => [...l, { key, raw, kind, state: "loading", tag: null }]);
    else setLoves((l) => [...l, { key, raw, kind, state: "loading", candidates: [], selected: null }]);

    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: raw, kind, birthYear: validYear ? year : undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setLoves((list) =>
        list.map((x) => {
          if (x.key !== key) return x;
          if (x.kind === "food") return { ...x, state: "ready", tag: body.food?.tag ?? null };
          const candidates: Candidate[] = body.candidates ?? [];
          return { ...x, state: candidates.length ? "ready" : "empty", candidates, selected: candidates[0]?.id ?? null };
        }),
      );
    } catch {
      setLoves((list) => list.map((x) => (x.key === key ? { ...x, state: "error" } : x)));
    }
  }

  function addAvoid(text: string) {
    const t = text.trim();
    if (t && !avoid.some((a) => a.toLowerCase() === t.toLowerCase()) && avoid.length < 10) setAvoid((a) => [...a, t]);
    setAvoidText("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    if (!firstName.trim()) problems.push("Add their first name.");
    if (!validYear) problems.push("Add a birth year between 1915 and " + (new Date().getFullYear() - 40) + ".");
    if (!townQuery.trim()) problems.push("Add the town or city where they grew up.");
    const confirmed = loves.filter((l) => l.kind !== "food" && l.state === "ready" && l.selected);
    if (!confirmed.length) problems.push("Add at least one singer, film, show or book they loved.");
    if (loves.some((l) => l.state === "loading")) problems.push("Wait a moment for the last search to finish.");
    setErrors(problems);
    if (problems.length) return;

    setSubmitting(true);
    type SeedBody =
      | { kind: "food"; rawText: string; tagId: string | null }
      | { kind: "entity"; rawText: string; entityId: string; entityType: string; name: string; year: number | null; image: string | null };
    const seeds = loves.flatMap((l): SeedBody[] => {
      if (l.kind === "food") return l.state === "ready" ? [{ kind: "food", rawText: l.raw, tagId: l.tag?.id ?? null }] : [];
      const c = l.candidates.find((x) => x.id === l.selected);
      return c ? [{ kind: "entity", rawText: l.raw, entityId: c.id, entityType: c.type, name: c.name, year: c.year, image: c.image }] : [];
    });
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        birthYear: year,
        hometown: town ? { label: town.label, localityId: town.id, lat: town.lat, lon: town.lon } : { label: townQuery.trim(), localityId: null, lat: null, lon: null },
        filmCountry: filmCountry.trim() || null,
        languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
        seeds,
        avoid,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrors([body.error ?? "Something went wrong saving this. Please try again."]);
      setSubmitting(false);
      return;
    }
    router.push(`/p/${body.id}`);
  }

  const name = firstName.trim() || "they";
  const possessive = firstName.trim() ? `${firstName.trim()}’s` : "their";

  return (
    <form onSubmit={submit} className="flex flex-col gap-14" noValidate>
      <fieldset className="grid gap-6">
        <legend className="mb-6 font-display text-3xl">Who is this for?</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id={`${ids}-name`} title="First name" hint="First name only. Nothing else about them is stored.">
            <input id={`${ids}-name`} className={input} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" maxLength={40} />
          </Field>
          <Field id={`${ids}-year`} title="Year they were born" hint="Just the year. Encore looks at the songs and films from when they were 10 to 30.">
            <input
              id={`${ids}-year`}
              className={input}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="1941"
            />
          </Field>
        </div>
        <Field id={`${ids}-town`} title="Where they grew up" hint="Used to find places and food from home.">
          <div className="relative">
            <input
              id={`${ids}-town`}
              className={input}
              value={townQuery}
              onChange={(e) => {
                setTownQuery(e.target.value);
                setTown(null);
              }}
              placeholder="Brooklyn"
              autoComplete="off"
              aria-describedby={`${ids}-towns-status`}
            />
            <span id={`${ids}-towns-status`} className="sr-only" aria-live="polite">
              {townOptions.length ? `${townOptions.length} matching places below` : ""}
            </span>
            {townLoading && <span className="absolute right-4 top-3.5 text-sm text-muted">Looking…</span>}
            {town && <span className="absolute right-4 top-3.5 text-sm font-bold text-accent">Found</span>}
          </div>
          {townOptions.length > 0 && (
            <ul id={`${ids}-towns`} className="mt-2 grid gap-1.5" aria-label="Matching places">
              {townOptions.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => pickTown(t)} className="w-full rounded-md border border-ink/15 bg-card px-4 py-3 text-left hover:border-ink/40">
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id={`${ids}-film`} title="Films and TV mostly from" hint="Filled in from their hometown. Change it if they watched films from elsewhere, like Mexico.">
            <input id={`${ids}-film`} className={input} value={filmCountry} onChange={(e) => setFilmCountry(e.target.value)} placeholder="United States" />
          </Field>
          <Field id={`${ids}-lang`} title="Languages they speak" hint="First language first. If it isn’t English, Encore also writes the prompts in it.">
            <input id={`${ids}-lang`} className={input} value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="English, Spanish" />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-3xl">What did {name === "they" ? "they" : name} love?</legend>
        <p className="mb-6 max-w-[60ch] text-muted">
          Add 2 to 5 things: a singer, a film, a TV show, a book, a place or a dish. Pick the right match for each one so Encore starts from the real thing.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor={`${ids}-love`} className="sr-only">
            Something they loved
          </label>
          <input
            id={`${ids}-love`}
            className={`${input} sm:flex-1`}
            value={loveText}
            onChange={(e) => setLoveText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLove();
              }
            }}
            placeholder="Frank Sinatra"
            autoComplete="off"
          />
          <label htmlFor={`${ids}-kind`} className="sr-only">
            Kind
          </label>
          <select id={`${ids}-kind`} className={`${input} sm:w-48`} value={loveKind} onChange={(e) => setLoveKind(e.target.value as SeedKind)}>
            {Object.entries(SEED_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={addLove} disabled={!loveText.trim() || loves.length >= 8} className="rounded-md bg-ink px-6 py-3 text-lg font-bold text-paper disabled:opacity-40">
            Add
          </button>
        </div>

        <ul className="mt-6 flex flex-col gap-5">
          {loves.map((l) => (
            <li key={l.key} className="rounded-lg border border-rule bg-card p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <p>
                  <span className="font-bold">“{l.raw}”</span>
                  <span className="ml-2 text-sm text-muted">{SEED_KINDS[l.kind].label}</span>
                </p>
                <button type="button" onClick={() => setLoves((list) => list.filter((x) => x.key !== l.key))} className="-my-2 min-h-11 px-1 text-sm font-bold text-muted hover:text-ink">
                  Remove
                </button>
              </div>
              {l.state === "loading" && <p className="text-muted">Searching Qloo…</p>}
              {l.state === "error" && <p className="text-ink">Qloo didn’t answer. Remove this and add it again.</p>}
              {l.kind === "food" && l.state === "ready" && (
                <p className="text-sm text-ink">{l.tag ? `Encore will look for ${l.tag.name.toLowerCase()} places near home.` : "Encore will use this as a gentle food memory."}</p>
              )}
              {l.kind !== "food" && l.state === "empty" && <p className="text-ink">No match found. Try another spelling, or choose a kind like “Film”.</p>}
              {l.kind !== "food" && l.state === "ready" && (
                <>
                  <p className="mb-2 text-sm text-muted">Which one did {name === "they" ? "they" : name} mean?</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {l.candidates.map((c) => (
                      <CandidateTile
                        key={c.id}
                        c={c}
                        selected={l.selected === c.id}
                        onPick={() => setLoves((list) => list.map((x) => (x.key === l.key && x.kind !== "food" ? { ...x, selected: c.id } : x)))}
                      />
                    ))}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-3xl">Anything to stay away from?</legend>
        <p className="mb-6 max-w-[60ch] text-muted">War, horror, disasters, funerals and graphic violence are always left out. Add anything else that could upset {name === "they" ? "them" : name}.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor={`${ids}-avoid`} className="sr-only">
            Something to avoid
          </label>
          <input
            id={`${ids}-avoid`}
            className={`${input} sm:flex-1`}
            value={avoidText}
            onChange={(e) => setAvoidText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAvoid(avoidText);
              }
            }}
            placeholder="A song from a funeral"
          />
          <button type="button" onClick={() => addAvoid(avoidText)} disabled={!avoidText.trim()} className="rounded-md border border-ink/30 px-6 py-3 text-lg font-bold disabled:opacity-40">
            Add
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {AVOID_SUGGESTIONS.filter((s) => !avoid.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => addAvoid(s)} className="min-h-11 rounded-full border border-dashed border-ink/30 px-4 text-sm hover:border-ink/60">
              + {s}
            </button>
          ))}
          {avoid.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-ink py-0.5 pl-3 pr-0.5 text-sm text-paper">
              {a}
              <button type="button" onClick={() => setAvoid((list) => list.filter((x) => x !== a))} aria-label={`Remove ${a}`} className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold hover:bg-white/15">
                ×
              </button>
            </span>
          ))}
        </div>
      </fieldset>

      <div className="border-t border-rule pt-8">
        {errors.length > 0 && (
          <ul className="mb-5 list-disc pl-5 text-ink" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button type="submit" disabled={submitting} className="w-full rounded-full bg-accent px-8 py-4 text-lg font-bold text-paper disabled:opacity-60 sm:w-auto">
          {submitting ? "Saving…" : `Build ${possessive} world`}
        </button>
        <p className="mt-3 text-sm text-muted">Takes about a minute. You’ll watch Encore work through Qloo’s taste graph step by step.</p>
      </div>
    </form>
  );
}

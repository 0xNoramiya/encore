"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DOMAINS } from "@/lib/domains";
import type { ProfileItem } from "@/lib/profiles";
import type { Learned } from "@/lib/sessions";
import { useAgentStream } from "@/lib/client/use-agent-stream";
import { PlanSessionButton } from "./PlanSessionButton";
import { Provenance } from "./Provenance";
import { TraceTimeline } from "./TraceTimeline";

const REACTION_LABEL = { sang_along: "Sang or talked along", lit_up: "Lit up" } as const;

interface Props {
  sessionId: string;
  profileId: string;
  firstName: string;
  canEdit: boolean;
  learned: Learned | null;
  newItems: ProfileItem[];
  seedsBefore: string[];
  seedsAfter: string[];
}

export function AfterSession({ sessionId, profileId, firstName, canEdit, learned: initial, newItems, seedsBefore, seedsAfter }: Props) {
  const router = useRouter();
  const stream = useAgentStream("/api/agent/learn");
  const started = useRef(false);

  useEffect(() => {
    if (!initial && canEdit && !started.current) {
      started.current = true;
      stream.start({ sessionId });
    }
  }, [initial, canEdit, sessionId, stream]);

  useEffect(() => {
    if (stream.status === "done") router.refresh();
  }, [stream.status, router]);

  const learned = initial ?? stream.learned;
  const expanding = !initial && stream.status === "running";
  const addedSeeds = seedsAfter.filter((s) => !seedsBefore.includes(s));

  return (
    <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <Link href={`/p/${profileId}`} className="text-sm font-bold text-muted hover:text-ink">
        Back to {firstName}’s world
      </Link>
      <h1 className="mt-4 font-display text-5xl leading-tight">What Encore learned</h1>

      {!learned && stream.status !== "error" && <p className="mt-6 text-lg text-muted">Looking at how {firstName} responded…</p>}
      {stream.status === "error" && <p className="mt-6 text-lg">{stream.error}</p>}

      {learned && (
        <>
          <blockquote className="mt-8 max-w-[56ch] border-l-4 border-accent pl-6 font-display text-2xl leading-relaxed text-ink sm:text-3xl">
            {learned.narrative}
          </blockquote>

          <dl className="mt-10 grid gap-x-10 gap-y-4 text-lg sm:grid-cols-2">
            {(["sang_along", "lit_up"] as const).map((r) => {
              const names = learned.liked.filter((l) => l.reaction === r).map((l) => l.name);
              return names.length ? (
                <div key={r}>
                  <dt className="text-sm text-muted">{REACTION_LABEL[r]}</dt>
                  <dd>{names.join(", ")}</dd>
                </div>
              ) : null;
            })}
            {learned.neutral.length > 0 && (
              <div>
                <dt className="text-sm text-muted">Neutral</dt>
                <dd>{learned.neutral.map((n) => n.name).join(", ")}</dd>
              </div>
            )}
            {learned.excluded.length > 0 && (
              <div>
                <dt className="text-sm text-muted">Upset</dt>
                <dd>{learned.excluded.map((n) => n.name).join(", ")}</dd>
              </div>
            )}
          </dl>

          {learned.toVersion > learned.fromVersion && (
            <section className="mt-14 border-t border-rule pt-10">
              <h2 className="font-display text-3xl">
                Taste Profile v{learned.fromVersion} <span className="text-accent">→</span> v{learned.toVersion}
              </h2>
              <div className="mt-6 grid gap-8 md:grid-cols-3">
                <div className="rounded-lg border border-rule bg-card p-5">
                  <h3 className="font-bold">Now steering the taste graph</h3>
                  <p className="mt-1 text-sm text-muted">Added to the seeds Encore sends to Qloo</p>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {(addedSeeds.length ? addedSeeds : learned.promoted.map((p) => p.name)).map((n) => (
                      <li key={n} className="font-display text-lg">
                        + {n}
                      </li>
                    ))}
                    {!learned.promoted.length && <li className="text-muted">Nothing new this time</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-rule bg-card p-5">
                  <h3 className="font-bold">Out for good</h3>
                  <p className="mt-1 text-sm text-muted">Excluded from every future Qloo request</p>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {learned.excluded.map((e) => (
                      <li key={e.entityId} className="font-display text-lg">
                        − {e.name}
                      </li>
                    ))}
                    {learned.excludeTags.map((t) => (
                      <li key={t.id} className="text-ink/85">
                        − anything tagged {t.name.toLowerCase()} <span className="text-sm text-muted">(because of {t.because})</span>
                      </li>
                    ))}
                    {!learned.excluded.length && <li className="text-muted">Nothing upsetting this time</li>}
                  </ul>
                </div>
                <div className="rounded-lg border border-rule bg-card p-5">
                  <h3 className="font-bold">New in v{learned.toVersion}</h3>
                  <p className="mt-1 text-sm text-muted">Fresh picks from the updated seeds</p>
                  <p className="mt-3 font-display text-4xl text-accent">{expanding ? "…" : newItems.length}</p>
                </div>
              </div>

              {expanding && (
                <div className="mt-8 rounded-lg border border-rule bg-card px-5 py-6 sm:px-8" aria-live="polite">
                  <h3 className="font-display text-2xl">Building v{learned.toVersion}</h3>
                  <div className="mt-4">
                    <TraceTimeline steps={stream.steps.filter((s) => s.id !== "apply" && s.id !== "narrate")} live />
                  </div>
                </div>
              )}

              {!expanding && newItems.length > 0 && (
                <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                  {newItems.map((i) => {
                    const src = i.media?.image ?? i.data.image;
                    return (
                      <article key={i.id} className="flex flex-col gap-2">
                        {src ? (
                          <img
                            src={src}
                            alt=""
                            className={`${i.domain === "music" ? "aspect-square" : i.domain === "food" || i.domain === "place" ? "aspect-[4/3]" : "aspect-[2/3]"} w-full rounded-md object-cover`}
                          />
                        ) : (
                          <div className="aspect-square w-full rounded-md bg-ink" aria-hidden />
                        )}
                        <p className="text-xs text-muted">{DOMAINS[i.domain].label}</p>
                        <h4 className="font-display text-lg leading-snug">{i.name}</h4>
                        <Provenance why={i.why} firstName={firstName} compact />
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {canEdit && !expanding && (
            <div className="mt-14 border-t border-rule pt-8">
              <PlanSessionButton profileId={profileId} label="Plan tomorrow’s session" />
            </div>
          )}
        </>
      )}
    </main>
  );
}

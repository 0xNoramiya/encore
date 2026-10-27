"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DOMAINS, type Domain } from "@/lib/domains";
import type { EraWindow } from "@/lib/era";
import type { AgentStep, ProfileItem } from "@/lib/profiles";
import { useAgentStream } from "@/lib/client/use-agent-stream";
import { EraStrip } from "./EraStrip";
import { ItemCard } from "./ItemCard";
import { TracePanel, TraceTimeline } from "./TraceTimeline";

const ORDER: Domain[] = ["music", "film", "tv", "food", "place", "book"];
const GRID: Record<Domain, string> = {
  music: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  film: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  tv: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  book: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  food: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  place: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

export interface ProfileViewProps {
  profile: { id: string; firstName: string; birthYear: number; hometown: string; summary: string | null; version: number; isTemplate: boolean };
  window: EraWindow;
  items: ProfileItem[];
  seeds: string[];
  avoid: string[];
  steps: AgentStep[];
  canEdit: boolean;
  needsBuild: boolean;
}

export function ProfileView({ profile, window, items, seeds, avoid, steps, canEdit, needsBuild }: ProfileViewProps) {
  const router = useRouter();
  const build = useAgentStream("/api/agent/profile");
  const started = useRef(false);
  const { firstName } = profile;

  useEffect(() => {
    if (needsBuild && canEdit && !started.current) {
      started.current = true;
      build.start({ profileId: profile.id, mode: "build" });
    }
  }, [needsBuild, canEdit, profile.id, build]);

  useEffect(() => {
    if (build.status === "done") router.refresh();
  }, [build.status, router]);

  const building = build.status === "running" || (needsBuild && build.status === "idle");
  const summary = (build.summary ?? profile.summary)?.replace(new RegExp(`^${firstName}'s world:\\s*`), "");
  const visible = items.filter((i) => i.status !== "excluded");
  const traceSteps = build.steps.length ? build.steps : steps;
  const qlooCalls = traceSteps.reduce((n, s) => n + (s.qloo?.length ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <section className="grid gap-8 pb-12 pt-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div>
          {profile.isTemplate && <p className="mb-3 text-sm font-bold text-accent">Example profile</p>}
          <h1 className="font-display text-5xl leading-[1.05] text-ink sm:text-6xl">{firstName}’s world</h1>
          <p className="mt-3 text-muted">
            Born {profile.birthYear} in {profile.hometown}
          </p>
          {summary && <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-ink">{summary}</p>}
        </div>
        <div className="flex flex-col gap-5">
          <EraStrip birthYear={profile.birthYear} window={window} firstName={firstName} />
          <div className="text-sm">
            <p>
              <span className="text-muted">What you told us: </span>
              {seeds.join(", ")}
            </p>
            {avoid.length > 0 && (
              <p className="mt-1">
                <span className="text-muted">Staying away from: </span>
                {avoid.join(", ")}
              </p>
            )}
          </div>
        </div>
      </section>

      {(building || build.status === "error") && (
        <section className="mb-12 rounded-lg border border-rule bg-card px-5 py-6 sm:px-8" aria-live="polite">
          <h2 className="font-display text-2xl">{build.status === "error" ? "The build stopped" : `Building ${firstName}’s world`}</h2>
          <p className="mt-1 max-w-[60ch] text-muted">
            {build.status === "error"
              ? build.error
              : "This takes about a minute. Each numbered step is a real call to Qloo’s taste graph, scoped to these years and this hometown."}
          </p>
          {build.status === "error" && canEdit && (
            <button type="button" onClick={() => build.start({ profileId: profile.id, mode: "build" })} className="mt-4 rounded-full bg-ink px-5 py-2.5 font-bold text-paper">
              Try again
            </button>
          )}
          <div className="mt-6">
            <TraceTimeline steps={build.steps} live />
          </div>
        </section>
      )}

      {!building && visible.length > 0 && (
        <>
          {ORDER.map((d) => {
            const list = visible.filter((i) => i.domain === d);
            if (!list.length) return null;
            return (
              <section key={d} className="border-t border-rule py-10">
                <h2 className="mb-6 flex items-baseline gap-3 font-display text-3xl">
                  {DOMAINS[d].plural}
                  <span className="font-sans text-base text-muted">{list.length}</span>
                </h2>
                <div className={`grid gap-x-5 gap-y-9 ${GRID[d]}`}>
                  {list.map((item) => (
                    <ItemCard key={item.id} item={item} firstName={firstName} />
                  ))}
                </div>
              </section>
            );
          })}

          {traceSteps.length > 0 && (
            <section className="border-t border-rule py-10">
              <TracePanel steps={traceSteps} qlooCalls={qlooCalls} />
            </section>
          )}
        </>
      )}
    </main>
  );
}

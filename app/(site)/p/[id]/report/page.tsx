import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { db } from "@/lib/db";
import type { Reaction } from "@/lib/learning";
import { getViewableProfile, loadProfileBundle } from "@/lib/profiles";
import { buildReport, KIND_NAMES } from "@/lib/report";
import type { SessionRow } from "@/lib/sessions";
import { getWorkspaceId } from "@/lib/workspace";

export const metadata: Metadata = { title: "Engagement report" };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function ReportPage({ params }: PageProps<"/p/[id]/report">) {
  const { id } = await params;
  const profile = await getViewableProfile(id, await getWorkspaceId());
  if (!profile) notFound();
  const [{ items, avoid }, sessions, reactions] = await Promise.all([
    loadProfileBundle(profile.id),
    db().from("sessions").select("*").eq("profile_id", profile.id).order("created_at"),
    db().from("reactions").select("session_id,entity_id,reaction,created_at").eq("profile_id", profile.id),
  ]);

  const report = buildReport({
    firstName: profile.first_name,
    sessions: ((sessions.data ?? []) as SessionRow[]).map((s) => ({
      id: s.id,
      title: s.plan.title,
      createdAt: s.created_at,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      plannedMinutes: Math.round(s.plan.items.reduce((n, i) => n + i.durationSec, 0) / 60),
      items: s.plan.items.map((i) => ({ entityId: i.entityId, kind: i.kind, title: i.title })),
      example: s.is_example,
    })),
    reactions: ((reactions.data ?? []) as { session_id: string; entity_id: string; reaction: Reaction; created_at: string }[]).map((r) => ({
      sessionId: r.session_id,
      entityId: r.entity_id,
      reaction: r.reaction,
      createdAt: r.created_at,
    })),
    tags: new Map(items.map((i) => [i.entity_id, i.data.tags ?? []])),
    keptOut: [
      ...avoid.filter((a) => a.source === "learned" && a.entity_id).map((a) => ({ name: a.raw_text, reason: "upset" as const })),
      ...avoid.filter((a) => a.source === "learned" && a.tag_id).map((a) => ({ name: a.raw_text, reason: "tag" as const })),
      ...avoid.filter((a) => a.source === "caregiver").map((a) => ({ name: a.raw_text, reason: "caregiver" as const })),
    ],
  });
  const name = profile.first_name;
  const possessive = profile.kind === "group" ? name : `${name}’s`;
  const range = report.log.length ? `${fmtDate(report.log[report.log.length - 1].date)} to ${fmtDate(report.log[0].date)}` : null;
  const h2 = "font-display text-2xl";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 sm:px-8 print:max-w-none print:px-0">
      <Link href={`/p/${profile.id}`} className="text-sm font-bold text-muted hover:text-ink print:hidden">
        Back to {possessive} {profile.kind === "group" ? "page" : "world"}
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl leading-tight">{possessive} engagement report</h1>
          <p className="mt-2 text-muted">
            {report.played ? `${report.played} session${report.played > 1 ? "s" : ""}, ${range}` : "No sessions played yet"}
            {profile.kind === "person" ? `. Born ${profile.birth_year}, ${profile.hometown.split(",")[0]}.` : "."}
          </p>
        </div>
        <PrintButton />
      </div>

      {report.hasExamples && (
        <p className="mt-6 rounded-lg bg-card px-5 py-3 text-sm text-muted">
          This example includes practice sessions with simulated caregiver taps, run through Encore’s real learning loop, so you can see what a report looks like.
          Sessions you play are added as you go.
        </p>
      )}

      <blockquote className="mt-8 max-w-[58ch] border-l-4 border-accent pl-6 font-display text-2xl leading-relaxed sm:text-3xl">{report.headline}</blockquote>

      {report.reacted > 0 && (
        <>
          <div className="mt-12 grid gap-10 lg:grid-cols-[3fr_2fr]">
            <section>
              <h2 className={h2}>By kind</h2>
              <table className="mt-4 w-full border-collapse text-left">
                <caption className="sr-only">Reactions by kind of item</caption>
                <thead>
                  <tr className="border-b-2 border-ink text-sm">
                    <th scope="col" className="py-2 pr-3 font-bold">
                      Kind
                    </th>
                    <th scope="col" className="py-2 pr-3 font-bold">
                      Warm
                    </th>
                    <th scope="col" className="hidden py-2 pr-3 font-bold sm:table-cell">
                      Neutral
                    </th>
                    <th scope="col" className="hidden py-2 pr-3 font-bold sm:table-cell">
                      Upset
                    </th>
                    <th scope="col" className="w-2/5 py-2 font-normal text-muted">
                      Lit up or sang along
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.byKind.map((k) => (
                    <tr key={k.kind} className="border-b border-rule">
                      <th scope="row" className="py-3 pr-3 font-normal">
                        {KIND_NAMES[k.kind]}
                      </th>
                      <td className="py-3 pr-3 tabular-nums">{k.warm}</td>
                      <td className="hidden py-3 pr-3 tabular-nums sm:table-cell">{k.neutral}</td>
                      <td className="hidden py-3 pr-3 tabular-nums sm:table-cell">{k.upset}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-rule" aria-hidden>
                            <div className="h-full rounded-full bg-accent" style={{ width: `${(k.warm / k.reacted) * 100}%` }} />
                          </div>
                          <span className="w-16 text-right text-sm tabular-nums text-muted">
                            {k.warm} of {k.reacted}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section>
              <h2 className={h2}>Best moments</h2>
              <ul className="mt-4 flex flex-col divide-y divide-rule">
                {report.bestMoments.map((m) => (
                  <li key={m.title} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="font-display text-lg">{m.title}</span>
                    <span className="shrink-0 text-sm text-muted">
                      {[m.sang && `sang along${m.sang > 1 ? ` ${m.sang}×` : ""}`, m.lit && `lit up${m.lit > 1 ? ` ${m.lit}×` : ""}`].filter(Boolean).join(", ")}
                    </span>
                  </li>
                ))}
                {!report.bestMoments.length && <li className="py-3 text-muted">None yet</li>}
              </ul>
            </section>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <section className="rounded-lg border border-rule bg-card p-5">
              <h2 className="font-bold">Works well</h2>
              <p className="mt-1 text-sm text-muted">Qloo genres that got warm reactions most of the time</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {report.worksWell.map((t) => (
                  <li key={t.name} className="rounded-full bg-accent-soft px-3 py-1 text-sm">
                    {t.name} <span className="tabular-nums text-muted">{t.warm}/{t.total}</span>
                  </li>
                ))}
                {!report.worksWell.length && <li className="text-sm text-muted">Needs a few more sessions</li>}
              </ul>
            </section>
            <section className="rounded-lg border border-rule bg-card p-5">
              <h2 className="font-bold">Doesn’t land</h2>
              <p className="mt-1 text-sm text-muted">Mostly neutral or upset so far</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {report.doesNotLand.map((t) => (
                  <li key={t.name} className="rounded-full border border-ink/20 px-3 py-1 text-sm">
                    {t.name} <span className="tabular-nums text-muted">{t.warm}/{t.total}</span>
                  </li>
                ))}
                {!report.doesNotLand.length && <li className="text-sm text-muted">Nothing clear yet</li>}
              </ul>
            </section>
            <section className="rounded-lg border border-rule bg-card p-5">
              <h2 className="font-bold">Kept out</h2>
              <p className="mt-1 text-sm text-muted">Never shown again</p>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {report.keptOut.map((k) => (
                  <li key={`${k.reason}-${k.name}`}>
                    {k.name} <span className="text-muted">({k.reason === "upset" ? "upset" : k.reason === "tag" ? "genre, after an upset" : "you asked"})</span>
                  </li>
                ))}
                {!report.keptOut.length && <li className="text-muted">Nothing yet</li>}
              </ul>
            </section>
          </div>
        </>
      )}

      <section className="mt-12">
        <h2 className={h2}>Activity log</h2>
        <p className="mt-1 text-sm text-muted">Participation in reminiscence activities, for families and care teams. Not a clinical assessment.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-ink">
                {["Date", "Session", "Length", "Reactions noted", "Warm", "Neutral", "Upset"].map((h) => (
                  <th key={h} scope="col" className="py-2 pr-4 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.log.map((l) => (
                <tr key={l.id} className="border-b border-rule">
                  <td className="py-3 pr-4 tabular-nums">{fmtDate(l.date)}</td>
                  <td className="py-3 pr-4">
                    {l.title}
                    {l.example && <span className="ml-2 text-xs text-muted">example</span>}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{l.minutes ? `${l.minutes} min` : `~${l.plannedMinutes} min planned`}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {l.reacted} of {l.ofItems}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{l.warm}</td>
                  <td className="py-3 pr-4 tabular-nums">{l.neutral}</td>
                  <td className="py-3 pr-4 tabular-nums">{l.upset}</td>
                </tr>
              ))}
              {!report.log.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-muted">
                    Played sessions will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

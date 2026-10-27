/**
 * Engagement report: what works for a person (or a group), computed from the
 * caregiver's taps. Pure and deterministic; the page only renders it.
 */
import type { Reaction } from "./learning";
import type { SessionKind } from "./session";

export interface ReportSession {
  id: string;
  title: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  plannedMinutes: number;
  items: { entityId: string; kind: SessionKind; title: string }[];
  example: boolean;
}

export interface ReportInput {
  firstName: string;
  sessions: ReportSession[];
  reactions: { sessionId: string; entityId: string; reaction: Reaction; createdAt: string }[];
  /** Profile items, for genre tags. */
  tags: Map<string, { id: string; name: string }[]>;
  keptOut: { name: string; reason: "upset" | "tag" | "caregiver" }[];
}

export interface KindRow {
  kind: SessionKind;
  reacted: number;
  warm: number;
  neutral: number;
  upset: number;
}

export interface Report {
  played: number;
  reacted: number;
  warm: number;
  warmRate: number | null;
  byKind: KindRow[];
  bestMoments: { title: string; kind: SessionKind; sang: number; lit: number }[];
  worksWell: { name: string; warm: number; total: number }[];
  doesNotLand: { name: string; warm: number; total: number }[];
  keptOut: ReportInput["keptOut"];
  log: { id: string; date: string; title: string; plannedMinutes: number; minutes: number | null; reacted: number; ofItems: number; warm: number; neutral: number; upset: number; example: boolean }[];
  headline: string;
  hasExamples: boolean;
}

export const KIND_NAMES: Record<SessionKind, string> = { song: "Music", film_clip: "Film clips", tv_clip: "TV clips", place: "Places", food: "Food", book: "Books" };
const isWarm = (r: Reaction) => r === "lit_up" || r === "sang_along";

export function buildReport(input: ReportInput): Report {
  const played = input.sessions.filter((s) => s.startedAt);
  // Latest tap per (session, item).
  const latest = new Map<string, { sessionId: string; entityId: string; reaction: Reaction }>();
  for (const r of [...input.reactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latest.set(`${r.sessionId}:${r.entityId}`, r);
  const taps = [...latest.values()];

  const kindOf = new Map<string, { kind: SessionKind; title: string }>();
  for (const s of input.sessions) for (const i of s.items) kindOf.set(i.entityId, { kind: i.kind, title: i.title });

  const byKind = new Map<SessionKind, KindRow>();
  const moments = new Map<string, { title: string; kind: SessionKind; sang: number; lit: number }>();
  const tagStats = new Map<string, { name: string; warm: number; total: number }>();

  for (const t of taps) {
    const k = kindOf.get(t.entityId);
    if (!k) continue;
    const row = byKind.get(k.kind) ?? { kind: k.kind, reacted: 0, warm: 0, neutral: 0, upset: 0 };
    row.reacted++;
    if (isWarm(t.reaction)) row.warm++;
    else if (t.reaction === "neutral") row.neutral++;
    else row.upset++;
    byKind.set(k.kind, row);

    if (isWarm(t.reaction)) {
      const m = moments.get(t.entityId) ?? { title: k.title, kind: k.kind, sang: 0, lit: 0 };
      if (t.reaction === "sang_along") m.sang++;
      else m.lit++;
      moments.set(t.entityId, m);
    }
    for (const tag of input.tags.get(t.entityId) ?? []) {
      const s = tagStats.get(tag.name.toLowerCase()) ?? { name: tag.name, warm: 0, total: 0 };
      s.total++;
      if (isWarm(t.reaction)) s.warm++;
      tagStats.set(tag.name.toLowerCase(), s);
    }
  }

  const reacted = taps.filter((t) => kindOf.has(t.entityId)).length;
  const warm = taps.filter((t) => kindOf.has(t.entityId) && isWarm(t.reaction)).length;
  const kinds = [...byKind.values()].sort((a, b) => b.warm / b.reacted - a.warm / a.reacted || b.reacted - a.reacted);
  const tagList = [...tagStats.values()].filter((t) => t.total >= 2);

  const log = played
    .map((s) => {
      const mine = taps.filter((t) => t.sessionId === s.id);
      return {
        id: s.id,
        date: s.startedAt ?? s.createdAt,
        title: s.title,
        plannedMinutes: s.plannedMinutes,
        minutes: s.startedAt && s.endedAt ? Math.max(1, Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)) : null,
        reacted: mine.length,
        ofItems: s.items.length,
        warm: mine.filter((t) => isWarm(t.reaction)).length,
        neutral: mine.filter((t) => t.reaction === "neutral").length,
        upset: mine.filter((t) => t.reaction === "upset").length,
        example: s.example,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const report: Report = {
    played: played.length,
    reacted,
    warm,
    warmRate: reacted ? warm / reacted : null,
    byKind: kinds,
    bestMoments: [...moments.values()].sort((a, b) => b.sang * 2 + b.lit - (a.sang * 2 + a.lit)).slice(0, 6),
    worksWell: tagList
      .filter((t) => t.warm / t.total >= 0.6)
      .sort((a, b) => b.warm - a.warm || b.total - a.total)
      .slice(0, 6),
    doesNotLand: tagList
      .filter((t) => t.warm / t.total <= 0.34)
      .sort((a, b) => b.total - b.warm - (a.total - a.warm))
      .slice(0, 6),
    keptOut: input.keptOut,
    log,
    headline: "",
    hasExamples: input.sessions.some((s) => s.example && s.startedAt),
  };
  report.headline = headline(input.firstName, report);
  return report;
}

export function headline(firstName: string, r: Report): string {
  if (!r.played || !r.reacted) return `No reactions noted yet. Play a session with ${firstName} and tap how each item lands; this report fills in as you go.`;
  const parts = [`Across ${r.played} session${r.played > 1 ? "s" : ""}, ${firstName} responded warmly to ${r.warm} of ${r.reacted} items (${Math.round(r.warmRate! * 100)}%).`];
  // Small samples shouldn't win the headline: prefer kinds with at least 3 reactions.
  const best = r.byKind.find((k) => k.reacted >= 3 && k.warm > 0) ?? r.byKind.find((k) => k.reacted >= 2 && k.warm > 0);
  if (best) parts.push(`${KIND_NAMES[best.kind]} works best (${best.warm} of ${best.reacted}).`);
  if (r.worksWell[0]) parts.push(`Lean into ${r.worksWell.slice(0, 2).map((t) => t.name.toLowerCase()).join(" and ")}.`);
  const avoidTag = r.keptOut.find((k) => k.reason === "tag");
  if (avoidTag) parts.push(`Steer clear of ${avoidTag.name.toLowerCase()}.`);
  return parts.join(" ");
}

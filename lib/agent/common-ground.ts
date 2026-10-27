/**
 * Common Ground: Qloo Analysis Compare between a caregiver's favourites and
 * their loved one's seeds, plus insights seeded with both, ranked so picks
 * driven by both people come first.
 */
import { artistOverlapsWindow } from "../era";
import { DOMAINS } from "../domains";
import { qloo, type QlooTrace } from "../qloo";
import type { InsightsParams } from "../qloo/params";
import type { QlooEntity } from "../qloo/types";
import type { Profile } from "../profiles";
import { rankCandidates } from "../seeds";
import { DEFAULT_MEDIA_EXCLUDES, loadAgentContext } from "./context";

export interface CommonGroundResult {
  mine: { id: string; name: string; type: string; year: number | null }[];
  shared: { name: string; score: number }[];
  picks: { id: string; name: string; type: string; year: number | null; image: string | null; both: boolean; drivers: { name: string; side: "you" | "them"; score: number }[] }[];
  calls: number;
}

const SHARED_SUBTYPE = /genre|theme|characteristic|style/;
const NOT_SHARED = /region|instrument|audience/;

/** Sides whose seeds are among the pick's top three drivers. */
export function sidesBehind(e: QlooEntity, owner: Map<string, "you" | "them">): Set<"you" | "them"> {
  const sides = new Set<"you" | "them">();
  for (const x of [...e.explain].filter((d) => owner.has(d.entityId)).sort((a, b) => b.score - a.score).slice(0, 3)) sides.add(owner.get(x.entityId)!);
  return sides;
}

export async function commonGround(profile: Profile, loves: string[]): Promise<CommonGroundResult> {
  const ctx = await loadAgentContext(profile);
  const traces: QlooTrace[] = [];
  const theirs = ctx.signalSeeds.slice(0, 5);

  const mine: CommonGroundResult["mine"] = [];
  for (const q of loves) {
    const r = await qloo.search(q, { types: ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:book"], take: 5 });
    traces.push(r.trace);
    const top = rankCandidates(r.data, q)[0];
    if (top && !mine.some((m) => m.id === top.id)) mine.push({ id: top.id, name: top.name, type: top.type, year: top.year ?? null });
  }
  if (!mine.length) return { mine, shared: [], picks: [], calls: traces.length };

  const names = new Map<string, string>([...theirs.map((s) => [s.id, s.name] as const), ...mine.map((m) => [m.id, m.name] as const)]);
  const owner = new Map<string, "you" | "them">([...theirs.map((s) => [s.id, "them"] as const), ...mine.map((m) => [m.id, "you"] as const)]);

  const cmp = await qloo.compare(
    theirs.map((s) => s.id),
    mine.map((m) => m.id),
    50,
  );
  traces.push(cmp.trace);
  const tags = ((cmp.data as { results?: { tags?: { name: string; subtype: string; query?: { score?: number } }[] } }).results?.tags ?? [])
    .filter((t) => SHARED_SUBTYPE.test(t.subtype) && !NOT_SHARED.test(t.subtype))
    .filter((t, i, all) => all.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase()) === i)
    .slice(0, 8)
    .map((t) => ({ name: t.name, score: Number((t.query?.score ?? 0).toFixed(2)) }));

  // Familiar to the loved one, still enjoyable together today: their era plus a decade.
  const window = { start: ctx.window.start - 10, end: ctx.window.end + 10 };
  const signal = [...theirs.map((s) => s.id), ...mine.map((m) => m.id)].join(",");
  const exclude = [...new Set([...ctx.excludeEntityIds, ...mine.map((m) => m.id)])].join(",");
  const picks: CommonGroundResult["picks"] = [];

  await Promise.all(
    (["music", "film"] as const).map(async (domain) => {
      const params: InsightsParams = { "filter.type": DOMAINS[domain].type, "signal.interests.entities": signal, "filter.exclude.entities": exclude, take: 30 };
      if (domain === "film") {
        params["filter.release_year.min"] = window.start;
        params["filter.release_year.max"] = window.end;
        params["filter.exclude.tags"] = [...new Set([...DEFAULT_MEDIA_EXCLUDES, ...ctx.avoidTagIds])].join(",");
      }
      const r = await qloo.insights(params);
      traces.push(r.trace);
      const ranked = r.data.entities
        .filter((e) => domain !== "music" || artistOverlapsWindow(e.year, e.endYear, window))
        .map((e) => ({ e, both: sidesBehind(e, owner).size === 2 }))
        .sort((a, b) => Number(b.both) - Number(a.both) || (b.e.affinity ?? 0) - (a.e.affinity ?? 0))
        .slice(0, 4);
      for (const { e, both } of ranked) {
        picks.push({
          id: e.id,
          name: e.name,
          type: e.type,
          year: domain === "music" ? null : (e.year ?? null),
          image: e.image ?? null,
          both,
          drivers: e.explain
            .filter((x) => owner.has(x.entityId))
            .slice(0, 3)
            .map((x) => ({ name: names.get(x.entityId)!, side: owner.get(x.entityId)!, score: Number(x.score.toFixed(2)) })),
        });
      }
    }),
  );

  return { mine, shared: tags, picks, calls: traces.length };
}

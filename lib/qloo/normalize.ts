import type { AggregateExplainability, QlooEntity, QlooTag, RawEntity, SeedInfluence } from "./types";

function externalIds(raw: RawEntity): QlooEntity["external"] {
  const src = raw.external ?? raw.properties?.external ?? {};
  const out: QlooEntity["external"] = {};
  for (const [source, v] of Object.entries(src)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (first?.id) out[source] = String(first.id);
  }
  return out;
}

export function normalizeEntity(raw: RawEntity): QlooEntity {
  const p = raw.properties ?? {};
  const type = raw.subtype ?? raw.types?.[0] ?? raw.type ?? "urn:entity";
  const explain = (raw.query?.explainability?.["signal.interests.entities"] ?? [])
    .map((e) => ({ entityId: e.entity_id, score: e.score }))
    .sort((a, b) => b.score - a.score);

  return {
    id: raw.entity_id,
    name: raw.name,
    type,
    year: p.release_year ?? p.publication_year ?? p.start_year,
    endYear: p.finale_year ?? p.end_year,
    image: p.image?.url,
    popularity: raw.popularity,
    description: p.short_description ?? p.description,
    address: p.address,
    location: raw.location,
    releaseCountries: p.release_country,
    notableSongs: p.notable_songs,
    external: externalIds(raw),
    tags: (raw.tags ?? []).map((t) => ({ id: t.id ?? t.tag_id ?? t.value ?? "", name: t.name, type: t.type })),
    affinity: raw.query?.affinity,
    explain,
  };
}

type RawAggregate = Partial<Record<`effect_on_${"top3" | "top5" | "top10" | "all"}_recs`, { entity_id: string; avg_score: number }[]>>;

export function normalizeAggregate(raw: RawAggregate | undefined): AggregateExplainability | undefined {
  if (!raw) return undefined;
  const conv = (list?: { entity_id: string; avg_score: number }[]): SeedInfluence[] =>
    (list ?? []).map((e) => ({ entityId: e.entity_id, score: e.avg_score }));
  return {
    top3: conv(raw.effect_on_top3_recs),
    top5: conv(raw.effect_on_top5_recs),
    top10: conv(raw.effect_on_top10_recs),
    all: conv(raw.effect_on_all_recs),
  };
}

export function normalizeTag(raw: { id: string; name: string; type: string; parents?: { type: string }[]; popularity?: number }): QlooTag {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    parentTypes: (raw.parents ?? []).map((p) => p.type),
    popularity: raw.popularity,
  };
}

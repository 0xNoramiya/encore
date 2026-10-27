import { tool } from "ai";
import { z } from "zod";
import { artistOverlapsWindow } from "../era";
import { DOMAINS, DOMAIN_KEYS, type Domain } from "../domains";
import { qloo, type QlooTrace } from "../qloo";
import type { InsightsParams } from "../qloo/params";
import type { QlooEntity } from "../qloo/types";
import { DEFAULT_MEDIA_EXCLUDES, type AgentContext } from "./context";

export interface PoolEntry {
  entity: QlooEntity;
  domain: Domain;
}

/** Shared state for one agent run: every entity Qloo returned, and each call's Qloo traces. */
export interface RunState {
  pool: Map<string, PoolEntry>;
  traces: Map<string, QlooTrace[]>;
  saved?: { items: { entityId: string; reason: string }[]; summary: string; dropped: string[] };
}

export function newRunState(): RunState {
  return { pool: new Map(), traces: new Map() };
}

function record(state: RunState, callId: string, trace: QlooTrace) {
  state.traces.set(callId, [...(state.traces.get(callId) ?? []), trace]);
}

function topTags(e: QlooEntity, n = 3): string[] {
  const preferred = e.tags.filter((t) => /genre|style|cuisine/.test(t.type));
  return [...new Set((preferred.length ? preferred : e.tags).map((t) => t.name))].slice(0, n);
}

const isScreen = (d: Domain) => d === "film" || d === "tv";

/** Builds the exact /v2/insights params for a domain, filling profile defaults the model didn't override. */
export function buildInsightsParams(
  ctx: AgentContext,
  input: {
    domain: Domain;
    seedIds?: string[];
    tags?: string[];
    excludeTags?: string[];
    releaseYearMin?: number;
    releaseYearMax?: number;
    releaseCountry?: string;
    radiusMeters?: number;
    popularityMax?: number;
    take?: number;
  },
): InsightsParams {
  const { domain } = input;
  const type = DOMAINS[domain].type;
  const known = new Set(ctx.signalSeeds.map((s) => s.id));
  const seedIds = input.seedIds?.filter((id) => known.has(id));
  const seeds = seedIds?.length ? seedIds : ctx.signalSeeds.map((s) => s.id);
  const take = Math.min(input.take ?? 15, 25);

  const p: InsightsParams = {
    "filter.type": type,
    "signal.interests.entities": seeds.join(","),
    // Artists have no era filter: over-fetch, then post-filter on start_year.
    take: domain === "music" ? 40 : take,
  };

  const age = new Date().getFullYear() - ctx.profile.birth_year;
  if (age >= 55 && (domain === "music" || isScreen(domain) || domain === "book")) p["signal.demographics.age"] = "55_and_older";

  if (isScreen(domain)) {
    p["filter.release_year.min"] = input.releaseYearMin ?? ctx.window.start;
    p["filter.release_year.max"] = input.releaseYearMax ?? ctx.window.end;
    const country = input.releaseCountry ?? ctx.profile.film_country ?? undefined;
    if (country && country.toLowerCase() !== "any") p["filter.release_country"] = country;
  }
  if (domain === "book") {
    p["filter.publication_year.min"] = input.releaseYearMin ?? ctx.window.start;
    p["filter.publication_year.max"] = input.releaseYearMax ?? ctx.window.end;
  }
  if (domain === "food" || domain === "place") {
    if (ctx.profile.locality_id) p["filter.location"] = ctx.profile.locality_id;
    else if (ctx.profile.lat != null && ctx.profile.lon != null) {
      p["filter.location"] = `POINT(${ctx.profile.lon} ${ctx.profile.lat})`;
      p["filter.location.radius"] = input.radiusMeters ?? 15000;
    }
    const foodTags = ctx.foodSeeds.map((f) => f.tagId).filter((t): t is string => Boolean(t));
    const tags = input.tags?.length ? input.tags : domain === "food" ? (foodTags.length ? foodTags : ["urn:tag:genre:place:restaurant"]) : [];
    if (tags.length) p["filter.tags"] = [...new Set(tags)].join(",");
  } else if (input.tags?.length) {
    p["filter.tags"] = input.tags.join(",");
  }

  const excludeTags = [...(input.excludeTags ?? []), ...ctx.avoidTagIds, ...(isScreen(domain) || domain === "book" ? DEFAULT_MEDIA_EXCLUDES : [])];
  if (excludeTags.length) p["filter.exclude.tags"] = [...new Set(excludeTags)].join(",");
  if (ctx.excludeEntityIds.length) p["filter.exclude.entities"] = ctx.excludeEntityIds.join(",");
  if (input.popularityMax !== undefined) p["filter.popularity.max"] = input.popularityMax;
  return p;
}

export function profileTools(ctx: AgentContext, state: RunState) {
  const name = ctx.profile.first_name;

  return {
    qloo_tags_search: tool({
      description:
        "Search Qloo's tag catalog to turn free text (e.g. 'war footage', 'horror', 'deli') into real tag IDs (urn:tag:...). Use it for the avoid list and for food cuisines. Tag IDs are never free text.",
      inputSchema: z.object({
        query: z.string().describe("Free text, e.g. 'horror' or 'Mexican food'"),
        forType: z.enum(["urn:entity:movie", "urn:entity:artist", "urn:entity:place", "urn:entity:book"]).optional().describe("Only tags that apply to this entity type"),
      }),
      execute: async ({ query, forType }, { toolCallId }) => {
        const r = await qloo.tags(query, { parentType: forType, typoTolerance: true, take: 8 });
        record(state, toolCallId, r.trace);
        // Genre tags are the ones insights filters respond to best; list them first.
        const rank = (id: string) => (id.includes(":genre:") ? 0 : id.includes(":keyword:") || id.includes(":subgenre:") ? 1 : 2);
        const tags = [...r.data].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, 6);
        return { query, tags: tags.map((t) => ({ id: t.id, name: t.name, type: t.type })) };
      },
    }),

    qloo_insights: tool({
      description: `Ask Qloo's taste graph (/v2/insights) for entities in one domain that ${name}'s seeds point to. Era (reminiscence window), film country, hometown location, the 55+ age signal, the avoid list and the default content exclusions are filled in automatically; pass fields only to override or broaden. Results include which seeds drove each pick (explainability).`,
      inputSchema: z.object({
        domain: z.enum(DOMAIN_KEYS as [Domain, ...Domain[]]),
        seedIds: z.array(z.string()).optional().describe("Subset of seed entity IDs to use as signal; default is all seeds"),
        tags: z.array(z.string()).optional().describe("Qloo tag IDs to require (filter.tags), e.g. a cuisine for food"),
        excludeTags: z.array(z.string()).optional().describe("Extra Qloo tag IDs to exclude"),
        releaseYearMin: z.number().int().optional(),
        releaseYearMax: z.number().int().optional(),
        releaseCountry: z.string().optional().describe('Full country name, or "any" to drop the country filter'),
        radiusMeters: z.number().int().min(1000).max(80000).optional(),
        popularityMax: z.number().min(0).max(1).optional().describe("Below 1 surfaces deeper cuts"),
        take: z.number().int().min(3).max(25).optional(),
      }),
      execute: async (input, { toolCallId }) => {
        const hasLocation = ctx.profile.locality_id || (ctx.profile.lat != null && ctx.profile.lon != null);
        if ((input.domain === "food" || input.domain === "place") && !hasLocation) {
          return { domain: input.domain, count: 0, results: [], note: "No hometown location on file, so this domain is skipped." };
        }
        const params = buildInsightsParams(ctx, input);
        const r = await qloo.insights(params);
        record(state, toolCallId, r.trace);

        let entities = r.data.entities;
        let droppedOutOfEra = 0;
        if (input.domain === "music") {
          const inEra = entities.filter((e) => artistOverlapsWindow(e.year, e.endYear, ctx.window));
          droppedOutOfEra = entities.length - inEra.length;
          entities = inEra.slice(0, Math.min(input.take ?? 15, 25));
        }
        for (const e of entities) if (!state.pool.has(e.id)) state.pool.set(e.id, { entity: e, domain: input.domain });

        return {
          domain: input.domain,
          applied: Object.fromEntries(Object.entries(params).filter(([k]) => k.startsWith("filter.release") || k.startsWith("filter.publication") || k === "filter.tags")),
          count: entities.length,
          ...(input.domain === "music" ? { droppedOutOfEra } : {}),
          results: entities.map((e) => ({
            entityId: e.id,
            name: e.name,
            year: e.year ?? null,
            popularity: typeof e.popularity === "number" ? Number(e.popularity.toFixed(2)) : null,
            tags: topTags(e),
            drivenBy: e.explain.slice(0, 2).map((x) => `${ctx.names.get(x.entityId) ?? x.entityId} ${x.score.toFixed(2)}`),
            ...(e.address ? { address: e.address } : {}),
          })),
        };
      },
    }),

    save_profile: tool({
      description: `Save the curated Taste Profile: a diverse shortlist of entityIds from qloo_insights results, each with a short caregiver-facing reason, plus a 2-3 sentence summary starting "${name}'s world:". Call once, at the end.`,
      inputSchema: z.object({
        items: z
          .array(z.object({ entityId: z.string(), reason: z.string().max(200) }))
          .min(1)
          .max(40),
        summary: z.string().max(800),
      }),
      execute: async ({ items, summary }) => {
        const seen = new Set<string>();
        const valid = items.filter((i) => state.pool.has(i.entityId) && !seen.has(i.entityId) && seen.add(i.entityId));
        const dropped = items.filter((i) => !state.pool.has(i.entityId)).map((i) => i.entityId);
        state.saved = { items: valid, summary, dropped };
        return { saved: valid.length, dropped };
      },
    }),
  };
}

export type ProfileTools = ReturnType<typeof profileTools>;

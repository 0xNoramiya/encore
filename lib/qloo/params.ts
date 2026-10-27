/**
 * Per-entity-type whitelist for /v2/insights.
 *
 * Qloo silently ignores params a filter.type doesn't support and still returns
 * plausible results, so an unsupported param is a silent bug. Every insights
 * request goes through validateInsightsParams(): in dev/test it throws, in
 * production it strips the param and warns.
 *
 * Sources: the hackathon brief's verified list plus our own probes (see CLAUDE.md).
 */

export const ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:video_game",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const AGE_BUCKETS = [
  "35_and_younger",
  "36_to_55",
  "55_and_older",
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_to_44",
  "45_to_54",
] as const;

const COMMON = [
  "filter.type",
  "signal.interests.entities",
  "signal.interests.tags",
  "signal.demographics.age",
  "signal.demographics.age.weight",
  "signal.demographics.gender",
  "signal.demographics.audiences",
  "filter.tags",
  "filter.exclude.entities",
  "filter.exclude.tags",
  "filter.popularity.min",
  "filter.popularity.max",
  "filter.results.entities",
  "bias.trends",
  "feature.explainability",
  "take",
  "offset",
] as const;

const SCREEN = [
  "filter.release_year.min",
  "filter.release_year.max",
  // Full country name ("United States", "Mexico"). ISO codes like "US" return 0 results.
  "filter.release_country",
  "filter.content_rating",
  "filter.rating.min",
  "filter.rating.max",
] as const;

const GEO = [
  // WKT "POINT(lon lat)" (longitude first) or a Qloo locality entity ID.
  "filter.location",
  // Meters (probed: 50 → 0 results, 1000 → venues within ~1 km).
  "filter.location.radius",
  "filter.geocode.name",
  "filter.geocode.admin1_region",
  "filter.geocode.country_code",
] as const;

export const INSIGHTS_PARAMS: Record<EntityType, ReadonlySet<string>> = {
  // No release-year filter for artists: era comes from seeds, the age signal and
  // a start_year post-filter (lib/era.ts).
  "urn:entity:artist": new Set(COMMON),
  "urn:entity:movie": new Set([...COMMON, ...SCREEN]),
  "urn:entity:tv_show": new Set([...COMMON, ...SCREEN]),
  // Books use publication_year; release_year is silently ignored (probed).
  "urn:entity:book": new Set([...COMMON, "filter.publication_year.min", "filter.publication_year.max"]),
  "urn:entity:place": new Set([
    ...COMMON,
    ...GEO,
    "filter.price_level.min",
    "filter.price_level.max",
    "filter.hours",
    "sort_by",
  ]),
  "urn:entity:destination": new Set([...COMMON, ...GEO]),
  "urn:entity:podcast": new Set(COMMON),
  // Not probed yet; only the common set is allowed until we verify more.
  "urn:entity:brand": new Set(COMMON),
  "urn:entity:person": new Set(COMMON),
  "urn:entity:video_game": new Set(COMMON),
};

export type InsightsParams = Record<string, string | number | boolean>;

export class QlooParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QlooParamError";
  }
}

const strict = () => process.env.NODE_ENV !== "production";

function fail(problems: string[], params: InsightsParams, drop: string[]): InsightsParams {
  const message = `Invalid Qloo insights params: ${problems.join("; ")}`;
  if (strict()) throw new QlooParamError(message);
  console.warn(message);
  const cleaned = { ...params };
  for (const k of drop) delete cleaned[k];
  return cleaned;
}

/** Returns the params unchanged if valid; throws (dev) or strips bad keys (prod). */
export function validateInsightsParams(params: InsightsParams): InsightsParams {
  const type = params["filter.type"];
  if (typeof type !== "string" || !(ENTITY_TYPES as readonly string[]).includes(type)) {
    // Can't strip our way out of a missing/invalid type, so this always throws.
    throw new QlooParamError(`filter.type must be one of ${ENTITY_TYPES.join(", ")} (got ${String(type)})`);
  }
  const allowed = INSIGHTS_PARAMS[type as EntityType];
  const problems: string[] = [];
  const drop: string[] = [];

  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) {
      problems.push(`"${key}" is not supported for ${type}`);
      drop.push(key);
    }
  }

  const age = params["signal.demographics.age"];
  if (age !== undefined && !String(age).split(",").every((a) => (AGE_BUCKETS as readonly string[]).includes(a))) {
    problems.push(`signal.demographics.age "${age}" is not a valid bucket`);
    drop.push("signal.demographics.age");
  }

  const country = params["filter.release_country"];
  if (country !== undefined && /^[A-Za-z]{2,3}$/.test(String(country))) {
    problems.push(`filter.release_country needs a full country name, not a code ("${country}")`);
    drop.push("filter.release_country");
  }

  const loc = params["filter.location"];
  if (typeof loc === "string" && loc.startsWith("POINT")) {
    const m = loc.match(/^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/);
    if (!m) {
      problems.push(`filter.location "${loc}" is not WKT POINT(lon lat)`);
      drop.push("filter.location");
    } else {
      const [lon, lat] = [Number(m[1]), Number(m[2])];
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
        problems.push(`filter.location "${loc}" out of range (longitude comes first)`);
        drop.push("filter.location");
      }
    }
  }

  const take = params.take;
  if (take !== undefined && (!Number.isInteger(Number(take)) || Number(take) < 1 || Number(take) > 50)) {
    problems.push(`take must be an integer 1-50 (got ${take})`);
    drop.push("take");
  }

  return problems.length ? fail(problems, params, drop) : params;
}

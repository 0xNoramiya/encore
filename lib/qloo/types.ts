/**
 * Qloo response shapes, as observed by scripts/probe-qloo.ts (see CLAUDE.md).
 * Search and insights disagree on a few fields, so normalizeEntity() folds both
 * into QlooEntity, which is what the rest of the app uses.
 */

export interface RawTag {
  id?: string; // insights
  tag_id?: string; // search
  name: string;
  type: string;
  value?: string;
}

/** Search: properties.external.<source> = { id }. Insights: external.<source> = [{ id, ... }]. */
type RawExternal = Record<string, { id: string } | { id: string }[]>;

export interface RawEntity {
  name: string;
  entity_id: string;
  type?: string; // insights: "urn:entity"
  subtype?: string; // insights: "urn:entity:artist"
  types?: string[]; // search: ["urn:entity:artist"]
  popularity?: number;
  disambiguation?: string;
  properties?: Record<string, unknown> & {
    image?: { url?: string };
    external?: RawExternal;
    release_year?: number;
    publication_year?: number;
    finale_year?: number;
    start_year?: number;
    end_year?: number;
    year_of_death?: number;
    notable_songs?: string[];
    release_country?: string[];
    address?: string;
    short_description?: string;
    description?: string;
  };
  external?: RawExternal;
  tags?: RawTag[];
  location?: { lat: number; lon: number };
  query?: {
    affinity?: number;
    explainability?: {
      "signal.interests.entities"?: { entity_id: string; score: number }[];
    };
  };
}

export interface SeedInfluence {
  entityId: string;
  score: number;
}

/** Aggregate influence of each seed across the result set (top-level query.explainability). */
export interface AggregateExplainability {
  top3: SeedInfluence[];
  top5: SeedInfluence[];
  top10: SeedInfluence[];
  all: SeedInfluence[];
}

export interface QlooEntity {
  id: string;
  name: string;
  type: string; // urn:entity:artist etc.
  year?: number; // release/publication year, or an artist's start_year
  endYear?: number;
  image?: string;
  popularity?: number;
  description?: string;
  address?: string;
  location?: { lat: number; lon: number };
  releaseCountries?: string[];
  notableSongs?: string[];
  external: { spotify?: string; imdb?: string; [source: string]: string | undefined };
  tags: { id: string; name: string; type: string }[];
  affinity?: number;
  /** Which seeds drove this result (feature.explainability=true), sorted by score desc. */
  explain: SeedInfluence[];
}

export interface QlooTag {
  id: string;
  name: string;
  type: string;
  parentTypes: string[];
  popularity?: number;
}

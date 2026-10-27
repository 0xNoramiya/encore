import type { EntityType } from "./qloo/params";

export const DOMAINS = {
  music: { type: "urn:entity:artist", label: "Music", plural: "Songs & singers", sessionKind: "song" },
  film: { type: "urn:entity:movie", label: "Film", plural: "Films", sessionKind: "film_clip" },
  tv: { type: "urn:entity:tv_show", label: "TV", plural: "Television", sessionKind: "tv_clip" },
  book: { type: "urn:entity:book", label: "Books", plural: "Books", sessionKind: "book" },
  food: { type: "urn:entity:place", label: "Food", plural: "Tastes of home", sessionKind: "food" },
  place: { type: "urn:entity:place", label: "Places", plural: "Places", sessionKind: "place" },
} as const satisfies Record<string, { type: EntityType; label: string; plural: string; sessionKind: string }>;

export type Domain = keyof typeof DOMAINS;
export const DOMAIN_KEYS = Object.keys(DOMAINS) as Domain[];

/** Seed kinds a caregiver can pick in intake, mapped to Qloo search types. */
export const SEED_KINDS = {
  any: { label: "Anything", types: ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:book"] },
  music: { label: "Singer or band", types: ["urn:entity:artist"] },
  film: { label: "Film", types: ["urn:entity:movie"] },
  tv: { label: "TV show", types: ["urn:entity:tv_show"] },
  book: { label: "Book", types: ["urn:entity:book"] },
  place: { label: "Place", types: ["urn:entity:place", "urn:entity:destination"] },
  food: { label: "Dish or food", types: [] },
} as const satisfies Record<string, { label: string; types: readonly EntityType[] }>;

export type SeedKind = keyof typeof SEED_KINDS;

export function typeLabel(type: string): string {
  return (
    {
      "urn:entity:artist": "Music",
      "urn:entity:movie": "Film",
      "urn:entity:tv_show": "TV show",
      "urn:entity:book": "Book",
      "urn:entity:place": "Place",
      "urn:entity:destination": "Place",
    }[type] ?? "Item"
  );
}

/** Qloo locality ancestor names → the names filter.release_country expects. */
const COUNTRY_ALIASES: Record<string, string> = {
  "United States of America": "United States",
  "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
  "Russian Federation": "Russia",
  "Republic of Korea": "South Korea",
};

export function filmCountryName(qlooCountry: string | undefined): string | undefined {
  if (!qlooCountry) return undefined;
  return COUNTRY_ALIASES[qlooCountry] ?? qlooCountry;
}

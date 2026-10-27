/**
 * Qloo coverage + shape probe.
 *
 *   npm run probe
 *
 * Resolves every demo-persona seed with /search, then calls /v2/insights per
 * domain with the filters Encore will actually use. Raw responses go to
 * probe-output/ (gitignored: Qloo data must never be committed) and a coverage
 * table is printed. Findings are summarised in CLAUDE.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createQlooClient, type QlooTrace } from "../lib/qloo/client";
import { artistOverlapsWindow, reminiscenceWindow } from "../lib/era";
import type { InsightsParams } from "../lib/qloo/params";
import type { QlooEntity } from "../lib/qloo/types";

const OUT = join(process.cwd(), "probe-output");
mkdirSync(OUT, { recursive: true });

const qloo = createQlooClient();
const DEFAULT_EXCLUDE_TAGS = "urn:tag:genre:media:war,urn:tag:keyword:qloo:war,urn:tag:genre:media:horror";

interface Seed {
  query: string;
  type: "urn:entity:artist" | "urn:entity:movie" | "urn:entity:tv_show";
  year?: number; // disambiguate remakes
}

interface Persona {
  key: string;
  birthYear: number;
  locality: string; // resolved via /search types=urn:entity:locality
  country: string; // full name, for filter.release_country
  foodTags: string[];
  seeds: Seed[];
}

const PERSONAS: Persona[] = [
  {
    key: "dorothy",
    birthYear: 1941,
    locality: "Brooklyn",
    country: "United States",
    foodTags: ["urn:tag:genre:place:restaurant:deli", "urn:tag:genre:place:restaurant:pizza"],
    seeds: [
      { query: "Frank Sinatra", type: "urn:entity:artist" },
      { query: "Ella Fitzgerald", type: "urn:entity:artist" },
      { query: "Roman Holiday", type: "urn:entity:movie", year: 1953 },
      { query: "I Love Lucy", type: "urn:entity:tv_show", year: 1951 },
    ],
  },
  {
    key: "roberto",
    birthYear: 1946,
    locality: "San Antonio",
    country: "Mexico",
    foodTags: ["urn:tag:genre:place:restaurant:mexican"],
    seeds: [
      { query: "Pedro Infante", type: "urn:entity:artist" },
      { query: "Los Panchos", type: "urn:entity:artist" },
      { query: "The Magnificent Seven", type: "urn:entity:movie", year: 1960 },
    ],
  },
  {
    key: "siti",
    birthYear: 1950,
    locality: "Banjarmasin",
    country: "Indonesia",
    foodTags: ["urn:tag:genre:place:restaurant"],
    seeds: [
      { query: "Koes Plus", type: "urn:entity:artist" },
      { query: "Titiek Puspa", type: "urn:entity:artist" },
      { query: "Badai Pasti Berlalu", type: "urn:entity:movie", year: 1977 },
    ],
  },
];

const traces: QlooTrace[] = [];
const short = (t: string) => t.replace("urn:entity:", "");
const label = (e: QlooEntity) => (e.year ? `${e.name} (${e.year})` : e.name);

function pickSeed(results: QlooEntity[], seed: Seed): QlooEntity | undefined {
  const named = results.filter((r) => r.name.toLowerCase().includes(seed.query.toLowerCase()));
  if (seed.year) return named.find((r) => r.year === seed.year);
  return named[0];
}

async function insights(name: string, params: InsightsParams) {
  const r = await qloo.insights(params);
  traces.push(r.trace);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(r.data, null, 2));
  return r;
}

async function main() {
  const report: string[] = [];

  for (const p of PERSONAS) {
    const window = reminiscenceWindow(p.birthYear);
    report.push(`\n## ${p.key} (b. ${p.birthYear}, ${p.locality}) window ${window.start}-${window.end}`);

    const seeds: QlooEntity[] = [];
    for (const s of p.seeds) {
      const r = await qloo.search(s.query, { types: s.type, take: 5 });
      traces.push(r.trace);
      const chosen = pickSeed(r.data, s);
      const ambiguous = chosen && r.data[0]?.id !== chosen.id;
      report.push(
        `- seed "${s.query}"${s.year ? ` (${s.year})` : ""} [${short(s.type)}] → ${chosen ? `${label(chosen)}${ambiguous ? " (NOT top-1: needs picker)" : ""}` : "MISS"}; candidates: ${r.data
          .slice(0, 3)
          .map(label)
          .join(" | ")}`,
      );
      if (chosen) seeds.push(chosen);
    }
    if (!seeds.length) continue;

    const loc = (await qloo.search(p.locality, { types: "urn:entity:locality", take: 1 })).data[0];
    const signal = seeds.map((s) => s.id).join(",");
    const base = { "signal.interests.entities": signal, take: 15 };

    const artists = await insights(`${p.key}-artist`, { ...base, "filter.type": "urn:entity:artist", "signal.demographics.age": "55_and_older" });
    const inEra = artists.data.entities.filter((e) => artistOverlapsWindow(e.year, e.endYear, window));
    report.push(`- artist n=${artists.data.entities.length}, in era ${inEra.length} :: ${inEra.slice(0, 6).map(label).join(" | ")}`);

    for (const type of ["urn:entity:movie", "urn:entity:tv_show"] as const) {
      const r = await insights(`${p.key}-${short(type)}`, {
        ...base,
        "filter.type": type,
        "filter.release_year.min": window.start,
        "filter.release_year.max": window.end,
        "filter.release_country": p.country,
        "filter.exclude.tags": DEFAULT_EXCLUDE_TAGS,
      });
      report.push(`- ${short(type)} (${p.country}) n=${r.data.entities.length} :: ${r.data.entities.slice(0, 6).map(label).join(" | ")}`);
    }

    const books = await insights(`${p.key}-book`, {
      ...base,
      "filter.type": "urn:entity:book",
      "filter.publication_year.min": window.start,
      "filter.publication_year.max": window.end,
      "filter.exclude.tags": DEFAULT_EXCLUDE_TAGS,
    });
    report.push(`- book n=${books.data.entities.length} :: ${books.data.entities.slice(0, 5).map(label).join(" | ")}`);

    if (loc) {
      for (const tag of p.foodTags) {
        const r = await insights(`${p.key}-food-${tag.split(":").pop()}`, { ...base, "filter.type": "urn:entity:place", "filter.location": loc.id, "filter.tags": tag, take: 8 });
        report.push(`- food ${tag.split(":").pop()} n=${r.data.entities.length} :: ${r.data.entities.slice(0, 5).map((e) => e.name).join(" | ")}`);
      }
      const places = await insights(`${p.key}-place`, { ...base, "filter.type": "urn:entity:place", "filter.location": loc.id, take: 8 });
      report.push(`- place n=${places.data.entities.length} :: ${places.data.entities.slice(0, 5).map((e) => e.name).join(" | ")}`);
    } else {
      report.push(`- locality "${p.locality}" not found`);
    }
  }

  const slow = traces.filter((t) => !t.cached).sort((a, b) => b.ms - a.ms)[0];
  report.push(`\n${traces.length} calls, slowest ${slow?.endpoint} ${slow?.params["filter.type"] ?? ""} ${slow?.ms}ms`);
  writeFileSync(join(OUT, "coverage.md"), report.join("\n"));
  console.log(report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

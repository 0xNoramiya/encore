/**
 * Creates the read-only demo persona templates by calling the live Qloo API and
 * running the real profile agent. Nothing Qloo-derived is committed: it all
 * lands in the database.
 *
 *   npm run seed:personas            # all personas
 *   npm run seed:personas dorothy    # one
 */
import { db, must } from "../lib/db";
import { runProfileAgent } from "../lib/agent/profile";
import { filmCountryName } from "../lib/domains";
import { qloo } from "../lib/qloo";
import type { Profile } from "../lib/profiles";

interface PersonaDef {
  key: string;
  firstName: string;
  birthYear: number;
  locality: string;
  filmCountry?: string;
  languages: string[];
  seeds: { query: string; type: string; year?: number }[];
  food: string[];
  avoid: string[];
}

const PERSONAS: PersonaDef[] = [
  {
    key: "dorothy",
    firstName: "Dorothy",
    birthYear: 1941,
    locality: "Brooklyn",
    languages: ["English"],
    seeds: [
      { query: "Frank Sinatra", type: "urn:entity:artist" },
      { query: "Ella Fitzgerald", type: "urn:entity:artist" },
      { query: "Roman Holiday", type: "urn:entity:movie", year: 1953 },
      { query: "I Love Lucy", type: "urn:entity:tv_show", year: 1951 },
    ],
    food: ["egg cream", "pizza"],
    avoid: ["war footage"],
  },
  {
    key: "roberto",
    firstName: "Roberto",
    birthYear: 1946,
    locality: "San Antonio",
    filmCountry: "Mexico",
    languages: ["Spanish", "English"],
    seeds: [
      { query: "Pedro Infante", type: "urn:entity:artist" },
      { query: "Los Panchos", type: "urn:entity:artist" },
      { query: "The Magnificent Seven", type: "urn:entity:movie", year: 1960 },
    ],
    food: ["tamales", "Mexican food"],
    avoid: ["horror"],
  },
  {
    key: "margaret",
    firstName: "Margaret",
    birthYear: 1948,
    locality: "Liverpool",
    languages: ["English"],
    seeds: [
      { query: "The Beatles", type: "urn:entity:artist" },
      { query: "Cilla Black", type: "urn:entity:artist" },
      { query: "Coronation Street", type: "urn:entity:tv_show", year: 1960 },
    ],
    food: ["fish and chips"],
    avoid: ["sad endings"],
  },
];

async function seedPersona(def: PersonaDef) {
  console.log(`\n=== ${def.firstName}`);
  await db().from("profiles").delete().eq("persona_key", def.key).eq("is_persona_template", true);

  const loc = (await qloo.search(def.locality, { types: "urn:entity:locality", take: 1 })).data[0];
  const country = filmCountryName(loc?.ancestors?.find((a) => a.place === "country")?.name);
  const label = [loc?.name, loc?.ancestors?.find((a) => a.place === "city")?.name, loc?.ancestors?.find((a) => a.adminLevel === 4)?.name, country]
    .filter((x, i, a): x is string => Boolean(x) && a.indexOf(x) === i)
    .join(", ");

  const profile = must(
    await db()
      .from("profiles")
      .insert({
        workspace_id: null,
        is_persona_template: true,
        persona_key: def.key,
        first_name: def.firstName,
        birth_year: def.birthYear,
        hometown: label || def.locality,
        locality_id: loc?.id ?? null,
        lat: loc?.location?.lat ?? null,
        lon: loc?.location?.lon ?? null,
        country_name: country ?? null,
        film_country: def.filmCountry ?? country ?? null,
        languages: def.languages,
      })
      .select("*")
      .single(),
    "insert persona",
  ) as Profile;

  const seedRows = [];
  for (const s of def.seeds) {
    const { data } = await qloo.search(s.query, { types: s.type, take: 5 });
    const named = data.filter((e) => e.name.toLowerCase().includes(s.query.toLowerCase()));
    const hit = s.year ? named.find((e) => e.year === s.year) : named[0];
    if (!hit) {
      console.warn(`  seed not found: ${s.query}`);
      continue;
    }
    seedRows.push({ profile_id: profile.id, kind: "entity", raw_text: s.query, entity_id: hit.id, entity_type: s.type, name: hit.name, year: hit.year ?? null, image: hit.image ?? null, confirmed: true });
  }
  for (const f of def.food) {
    const { data } = await qloo.tags(f, { parentType: "urn:entity:place", typoTolerance: true, take: 5 });
    const tag = data.find((t) => t.id.startsWith("urn:tag:genre:place"));
    seedRows.push({ profile_id: profile.id, kind: "food", raw_text: f, name: f, tag_id: tag?.id ?? null, confirmed: true });
  }
  must(await db().from("seeds").insert(seedRows), "persona seeds");
  if (def.avoid.length) must(await db().from("avoid_items").insert(def.avoid.map((raw_text) => ({ profile_id: profile.id, raw_text, source: "caregiver" }))), "persona avoid");

  const t0 = Date.now();
  await runProfileAgent(profile, {
    emit: (e) => {
      if (e.t === "step" && e.step.status !== "running") console.log(`  [${e.step.tool ?? e.step.kind}] ${e.step.label}${e.step.summary ? ` → ${e.step.summary}` : ""}`);
      if (e.t === "done") console.log(`  done: ${e.itemCount} items\n  ${e.summary}`);
      if (e.t === "error") console.log(`  ERROR ${e.message}`);
    },
  });
  const { data: thoughts } = await db().from("agent_runs").select("steps").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(1).single();
  for (const s of (thoughts?.steps ?? []) as { kind: string; label: string }[]) if (s.kind === "thought") console.log(`  thought: ${s.label}`);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const only = process.argv[2];
for (const def of PERSONAS.filter((p) => !only || p.key === only)) await seedPersona(def);

@AGENTS.md

# Encore: engineering notes

Taste-memory agent for dementia caregivers, built for the Qloo Agentic Hackathon.
Deadline: Oct 31 2026 03:45 UTC (feature freeze Oct 30 18:00 WITA).

## Ground rules

- **Never commit** `.env.local`, API keys, `probe-output/`, or any real Qloo response data. Test fixtures are synthetic.
- Qloo responses are cached privately in Postgres (`qloo_cache`) only.
- Hosting: **Fly.io** (changed from the brief's Vercel at Rifqi's request). Deploy only after Rifqi accepts the build locally.
- Clinical rules (brief section 6): recognition, not recall. Never "Do you remember…?". Encore is a connection and mood tool, not a treatment. Never claim it reduces agitation.

## Commands

```
npm run dev       # next dev
npm test          # vitest: params validator, era math, client (synthetic fixtures)
npm run probe     # live Qloo probe → probe-output/ (gitignored)
npm run migrate   # apply supabase/migrations/*.sql via the Management API (needs SUPABASE_ACCESS_TOKEN)
npm run seed:personas [key]   # (re)build persona templates with the live agent
```

## Architecture (M1)

- `proxy.ts` sets the anonymous `encore_ws` cookie; `lib/workspace.ts` ensures the row. No login.
- Intake: `/api/locality` (Qloo locality search → hometown + film country), `/api/resolve` (multi-type search, era-aware ranking in `lib/seeds.ts`, food → place tags), `/api/profiles` (create).
- Profile build: `/api/agent/profile` streams NDJSON (`lib/agent/events.ts`). `lib/agent/profile.ts` runs deterministic pre-steps (era window, seed entities), then an AI SDK 7 `streamText` loop (`stopWhen: [isStepCount(12), hasToolCall("save_profile")]`) over tools in `lib/agent/tools.ts`, then saves items, resolves media and snapshots `profile_versions`.
- Guardrails: `buildInsightsParams` fills era/country/location/age/default exclusions server-side (the model only overrides); `save_profile` drops any entityId not returned by Qloo in this run; deterministic fallback shortlist if the model never saves; rate limits via `hit_rate_limit()` SQL.
- Persona templates are `profiles.is_persona_template = true`, read-only, built by `scripts/seed-personas.mts` (no Qloo data in git).
- Art in `public/art/*.webp` was generated with Higgsfield (GPT Image 2.5), source PNGs not committed.

## Decisions log

- Oct 28: Siti (Banjarmasin) dropped from the landing (thin film/TV/book coverage); "Southeast Asian catalog coverage" goes under What's Next. Margaret (1948, Liverpool: The Beatles, Cilla Black, Coronation Street) added as the third persona; coverage is excellent across all six domains.
- Oct 28: Repo private until submission (github.com/0xNoramiya/encore).

Tooling notes: `.npmrc` sets `legacy-peer-deps=true` (npm 10.9 crashes with `edgesOut` on vitest's optional peers otherwise). Vitest config is `.mts` because package.json is CJS. One-off tsx scripts with top-level await need the `.mts` extension.

## Qloo API: probed facts (Oct 27 2026)

Base `https://hackathon.api.qloo.com`, header `X-Api-Key`. Code: `lib/qloo/client.ts` (fetch, retry, cache, trace), `lib/qloo/params.ts` (per-type whitelist), `lib/qloo/normalize.ts` (shape folding).

### Response shapes

**`GET /search?query=&types=&take=`** → `{ results: RawEntity[] }`
- `types: string[]` (no `subtype`), `popularity`, `disambiguation`, `tags[]` use `tag_id`.
- External IDs live at `properties.external.<source> = { id }` (an object).
- Movies: `properties.release_year`, `release_country: string[]`, `content_rating`, `image.url`.
- Results are relevance-ordered, **not** era-aware: "The Magnificent Seven" returns the 2016 remake first, 1960 second. The intake must show candidates (with year + image) and let the caregiver pick.

**`GET /v2/insights`** → `{ success, results: { entities: RawEntity[] }, query: { explainability } }`
- Entity: `type: "urn:entity"`, `subtype: "urn:entity:artist"`, `popularity`, `tags[]` use `id`.
- External IDs live at **top-level** `external.<source> = [{ id, ... }]` (an array). Different from search.
- Per-entity `query.affinity` (0-1) and `query.explainability["signal.interests.entities"] = [{ entity_id, score }]` (scores sum to ~1 across seeds).
- Top-level `query.explainability["signal.interests.entities"].effect_on_{top3,top5,top10,all}_recs = [{ entity_id, avg_score }]`.
- Explainability only lists seeds that contributed. An **album** used as a seed contributed nothing (dropped from explainability), so seeds should be artist/movie/tv_show/book entities.

**`GET /v2/tags?filter.query=`** → `{ results: { tags: [{ id, name, type, parents: [{type}], popularity, properties }] } }`
- `filter.parents.types=urn:entity:movie` narrows to tags for a type. `feature.typo_tolerance=true` works.
- Useful IDs: `urn:tag:genre:media:horror`, `urn:tag:genre:media:war`, `urn:tag:keyword:qloo:war`, `urn:tag:genre:place:restaurant:deli`, `urn:tag:genre:place:restaurant:pizza`, `urn:tag:genre:place:restaurant:mexican`, `urn:tag:genre:place:restaurant`.

**`GET /entities?entity_ids=a,b`** → `{ results: RawEntity[] }` (search-like shape, plus `references`).

**`GET /v2/insights/compare?a.signal.interests.entities=&b.signal.interests.entities=`** → `{ results: { tags: [{ tag_id, name, subtype, query: { score, a.signal.interests.entities: [...], ... } }] } }`. `/v2/analysis/compare` returns the same. For Common Ground (stretch).

**Errors**: validation failures return `{ errors: [{ message, path }] }` (e.g. take > 50, bad age bucket). 404 is `{ error: { reason, message, code } }`.

### Param behaviour (verified by probing)

| Param | Finding |
|---|---|
| `take` | 1-50, server-validated (400 otherwise). |
| `signal.demographics.age` | Server-validated. Exactly: `35_and_younger, 36_to_55, 24_and_younger, 25_to_29, 30_to_34, 35_to_44, 45_to_54, 55_and_older`. |
| `filter.release_year.*` on artist | **Silently ignored** (identical results). Confirms the whitelist is needed. |
| `filter.release_year.*` on book | **Silently ignored.** Books use `filter.publication_year.min/max` (works). |
| `filter.release_country` | Needs the **full name** ("United States", "Mexico", "Indonesia"). `US` returns 0 results. |
| `filter.content_rating` | Comma list works: `G,PG`. |
| `filter.exclude.tags` | Accepted on movie (`urn:tag:genre:media:war,urn:tag:genre:media:horror`). |
| `filter.exclude.entities`, `filter.popularity.max` | Work on artist (popularity.max 0.9 surfaces deeper cuts). |
| `filter.location` (place) | WKT `POINT(lon lat)` works; a **locality entity ID** also works (`/search?types=urn:entity:locality`). |
| `filter.location.radius` | **Meters.** 50 → 0 results, 1000 → venues within ~1 km. |
| destination + location | 8 results for Brooklyn @ 25 km, 0 for San Antonio @ 25 km (2 @ 200 km), 0 for Banjarmasin. `filter.geocode.name` / `admin1_region` returned 0. Destinations are weak; don't build a core feature on them. |
| `filter.tags` (place) | Works for food: deli/pizza near Brooklyn, Mexican near San Antonio, generic restaurant in Banjarmasin. |

### Data useful for the product

- **Artists** carry `properties.start_year`, `end_year`, `notable_songs[]` (song titles), `biography`, `date_of_birth`. 25-30 of 30 results had `start_year`. There is no artist era filter, so `lib/era.ts:artistOverlapsWindow` post-filters on start/end year. `notable_songs` + artist name is the YouTube search query for a specific song.
- **Spotify artist IDs** on 23/30 (Siti), 22/30 (Roberto), 29/30 (Dorothy) artist results.
- **IMDb IDs** on movies/TV (`external.imdb[0].id`, e.g. `tt...`), so TMDB `/find/{imdb_id}` resolves posters and trailers.
- **TV**: `release_year`, `finale_year`, `plot_summary`, `content_rating`.
- **Books**: `publication_year`, `isbn13`, `image`.
- **Places**: `properties.address`, top-level `location {lat, lon}`, tags include cuisine/genre names.

### Latency

Artist insights are slow (7-10 s uncached). Book ~5 s. Movie/TV/place ~0.3-1.5 s. Cache everything; precompute personas.

## Persona coverage (Oct 27 2026)

Window = birthYear+10 … birthYear+30. "n" = results returned (take 10). Quality is a judgement on era/fit.

| Persona | Seeds resolved | Artist | Movie | TV | Book | Place / food | Destination |
|---|---|---|---|---|---|---|---|
| Dorothy (1941, Brooklyn) | 4/4, all top-1 correct | 15, excellent (11/15 pass era filter) | 15, excellent (US, 1951-71) | 15, excellent | 15, good with `publication_year` | 8 per tag; deli/pizza give strong food items | 8 |
| Roberto (1946, San Antonio) | 3/3, but Magnificent Seven top-1 = 2016 remake (needs picker) | 15, excellent (14/15 in era) | 15, excellent with `release_country=Mexico` + 1960 seed | 4 with Mexico (excellent fit), 8 with US | 15, **unsafe** (war/disaster nonfiction even with exclude tags) | 8, Mexican near San Antonio | 0-2 |
| Siti (1950, Banjarmasin) | 2/3 (Titiek Puspa pop 0.37); **film seed not in catalog** (exists only as an album + a 2021 TV show) | 15, Indonesian but skews modern: only 4/15 in era | 1 (Indonesia, 1960-80, war/horror excluded) | 0 | junk (UFO nonfiction) | 8, mostly cafes; Banjar soto with generic restaurant tag | 0 |

Takeaways:
1. Seed disambiguation is mandatory (Roberto's film).
2. `release_country` should follow the person's cultural heritage, not just hometown (Roberto: Mexico beats United States). Ask in intake or infer from seed release countries.
3. Always pass default exclusions (`urn:tag:genre:media:war`, `horror`, etc.) and treat books as optional; book results drift into war/disaster nonfiction.
4. Siti: music + food work, film/TV/books are thin. Recommendation pending Rifqi's call.

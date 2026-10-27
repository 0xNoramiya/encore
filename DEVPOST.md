# Encore

*When someone can no longer tell you what they love, their taste graph still can.*

## Inspiration

Dementia takes the words before it takes the person. Caregivers are told that familiar music and films can bring someone back for a moment, but "play some oldies" is advice for a decade, not a person. A woman who grew up in Brooklyn in the 1950s singing along to Ella Fitzgerald, and a man from San Antonio raised on Pedro Infante and Trío Los Panchos, need completely different afternoons. Their caregivers usually know three or four things they loved. We wanted to turn those three or four things into a whole world.

## What it does

Encore is a taste-memory agent for family caregivers and memory-care staff.

- **Two-minute intake.** First name, birth year, hometown, two to five things they loved, and anything to avoid. Every "they loved…" is resolved against Qloo, and when it's ambiguous the caregiver picks the right one (the 1960 *Magnificent Seven*, not the 2016 remake). Encore pre-selects the match from the person's era but never guesses silently.
- **A Taste Profile, built live.** Encore works out the years the person was 10 to 30 (the "reminiscence bump", when memories are most vivid) and runs an agent over Qloo's taste graph: singers, films, TV, books, food spots and places near their hometown, all scoped to those years. The caregiver watches every step, and every item says why it was picked: "Because Dorothy loved Frank Sinatra 0.27 and Roman Holiday 0.30."
- **Daily sessions.** The agent composes a 15-20 minute arc of 6-8 items (a warm opening song, variety in the middle, a calm closer) with prompts written to clinical guidance: invite and name things ("This is Dean Martin. Shall we listen?"), never test memory ("Do you remember…?").
- **Session Mode.** A calm, tablet-first screen: one big item, big type, one play button, no timers and no auto-advance. A separate caregiver bar records *Lit up*, *Sang or talked along*, *Neutral* or *Upset*. Upset stops the item at once and offers something they already enjoyed.
- **It learns.** Reactions update the profile deterministically. Songs they sang along to are promoted into the Qloo signal, upsetting items and their genre are excluded for good, and the agent expands the profile to v2 while you watch. A "What I learned" note explains the changes in plain words.

## Why Qloo

Encore only works because of Qloo's cross-domain taste graph. A language model on its own gives the famous hits of the decade. When we ran the same intake through the same model without tools, its session asked the person to remember things in most prompts and mostly repeated the seeds back. Encore's session found new things (Dean Martin, Louis Prima, L&B Spumoni Gardens in Brooklyn), every one traceable to a seed with a score. The "Compare with a generic AI" button in the app computes these differences live.

How we use the API:

- **`/search`** resolves seeds across artists, films, TV shows, books, places and destinations, and resolves the hometown to a Qloo **locality** ID.
- **`/v2/insights`** produces every recommendation, with `signal.interests.entities` (seeds, plus promoted favourites after each session), `signal.demographics.age` (55 and older), `filter.release_year.min/max` and `filter.release_country` for film and TV, `filter.publication_year.min/max` for books, `filter.location` (locality ID) plus `filter.tags` (cuisine tags) for food and places, `filter.exclude.tags` (war, horror, disaster, funerals, violence, the avoid list, and genres learned from upsetting reactions), `filter.exclude.entities` (excluded items and the seeds), and `feature.explainability` on every call.
- **Explainability** powers every "Because they loved…" chip and the aggregate seed influence in the trace.
- **`/v2/tags`** turns free text ("war footage", "fish and chips") into real tag IDs.
- **`/entities`** fetches seed details: images, Spotify and IMDb IDs, and notable songs.

## How we built it

- **Next.js 16** (App Router, TypeScript, Tailwind 4), deployed on **Fly.io**, with **Supabase Postgres** for profiles, items, sessions, reactions, agent traces and a private Qloo response cache.
- **Vercel AI SDK 7** with Claude. The profile build is a tool-calling loop (`qloo_insights`, `qloo_tags_search`, `save_profile`) streamed to the browser as NDJSON. Session composition uses structured output validated with **Zod**.
- **Guardrails around the model.** The server fills era, country, location, age and exclusions for every Qloo call (the model can only override them). Any entity ID that didn't come back from Qloo in that run is rejected. Prompts that test memory are replaced. Every LLM step has a deterministic fallback.
- **Learning is plain code.** `sang_along +2`, `lit_up +1`, `upset` means excluded forever; the LLM only explains the result.
- **No login.** An anonymous workspace cookie. The three example people are read-only templates, built by a script against the live API; opening one copies it into your workspace, so judges never see each other's reactions.
- **Illustrations** were generated for the project in one mid-century print style. There are no photos of real people anywhere.

## Challenges we ran into

- **Silent failures.** Qloo ignores parameters a type doesn't support and still returns plausible results. A release-year filter on artists or books changes nothing. We wrote a per-type parameter whitelist that throws in development, and found the right params by probing (books use `publication_year`; `release_country` needs "United States", not "US"; location radius is in meters).
- **Music has no era filter**, so we filter artists on their career start year after fetching.
- **Search is not era-aware.** That made the candidate picker essential rather than optional.
- **Coverage varies by region.** Our Indonesian persona (Koes Plus, Titiek Puspa) had good music and food but thin film and TV data in the reminiscence window, so we replaced her with a Liverpool persona and list Southeast Asian coverage as future work.
- **Clinical tone.** Writing prompts that invite instead of quiz took explicit rules in the prompt *and* a code check.

## Accomplishments that we're proud of

- The agent visibly adapts. It broadened a food search that came back empty, and when Roberto's food results weren't Mexican it retried with a cuisine tag on its own.
- Every recommendation is traceable to the memories it came from, with a score.
- The before/after: Profile v1 → v2 shows which favourites now steer the taste graph, what is out for good, and the new finds they led to.
- Session Mode is built for the person, not the demo: large type, large targets, no timers, and a calm path out when something upsets them.

## What we learned

The taste graph is most powerful as a *conversation partner* for an agent rather than a lookup: seeds in, explainability out, reactions back in as new seeds. And the right product for dementia care is honest about evidence. Music-based activities probably lift mood slightly and may help social connection, but probably don't reduce agitation (Cochrane, 2025). So Encore is a connection and mood tool, not a treatment, and it says so.

## What's next

- **Facility mode:** an activities director selects several residents and Encore builds one group session from their combined seeds, which is the per-bed business model for memory-care facilities.
- **Common Ground:** Qloo Analysis Compare between a caregiver's own favourites and their loved one's, to find things they can genuinely enjoy together.
- **Southeast Asian catalog coverage** and caregiver prompts in more languages (we started with an Indonesian persona).
- Exact songs and trailers through YouTube and TMDB, and sharing a session between family members.

*Encore is a comfort and connection tool, not a medical device or treatment.*

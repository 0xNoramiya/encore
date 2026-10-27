/**
 * Session plans: schema, clinical guardrails and a deterministic fallback.
 * The LLM only chooses and orders profile items and writes prompts; titles,
 * media and provenance always come from the profile (never from the model).
 */
import { z } from "zod";
import type { Domain } from "./domains";
import type { Media, ProfileItem } from "./profiles";

export const SESSION_KINDS = ["song", "film_clip", "tv_clip", "place", "food", "book"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const KIND_FOR_DOMAIN: Record<Domain, SessionKind> = {
  music: "song",
  film: "film_clip",
  tv: "tv_clip",
  place: "place",
  food: "food",
  book: "book",
};

export const DEFAULT_DURATION: Record<SessionKind, number> = { song: 180, film_clip: 150, tv_clip: 150, place: 90, food: 90, book: 90 };

const MediaSchema = z.object({
  image: z.string().optional(),
  spotifyEmbed: z.string().optional(),
  youtubeId: z.string().optional(),
  youtubeSearch: z.string().optional(),
  song: z.string().optional(),
  trailerQuery: z.string().optional(),
  mapsUrl: z.string().optional(),
  address: z.string().optional(),
});

export const SessionItemSchema = z.object({
  kind: z.enum(SESSION_KINDS),
  entityId: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().nullable().optional(),
  media: MediaSchema,
  why: z.object({ seedNames: z.array(z.string()), scores: z.array(z.number()) }),
  prompt: z.string().min(1).max(500),
  durationSec: z.number().int().min(30).max(600),
});

export const SessionPlanSchema = z.object({
  title: z.string().min(1).max(120),
  intro: z.string().max(400),
  items: z.array(SessionItemSchema).min(3).max(8),
});

export type SessionItem = z.infer<typeof SessionItemSchema>;
export type SessionPlan = z.infer<typeof SessionPlanSchema>;

/** What the model is allowed to produce. */
export const ModelPlanSchema = z.object({
  title: z.string().describe("Warm, short session title, e.g. 'An evening on the stoop'"),
  intro: z.string().describe("One or two sentences for the caregiver about today's arc"),
  items: z
    .array(
      z.object({
        entityId: z.string().describe("Must be an entityId from the profile list"),
        song: z.string().optional().describe("For music: one title from that artist's notable songs"),
        prompt: z.string().describe("What the caregiver says. Recognition, not recall."),
      }),
    )
    .min(6)
    .max(8),
});
export type ModelPlan = z.infer<typeof ModelPlanSchema>;

/**
 * Clinical rule: never test memory. Phrases like "Do you remember…?" or
 * "What year was…?" cause distress, so any prompt containing them is replaced.
 */
const MEMORY_TEST = /\b(remember|recall|recollect|memor(y|ies) of)\b|do you know (who|what|where|when)|what (year|was the name)|can you (name|tell me (who|what|when))|who (is|was) (this|that|singing)/i;

export function isSafePrompt(prompt: string): boolean {
  return !MEMORY_TEST.test(prompt);
}

export function fallbackPrompt(kind: SessionKind, title: string, opts: { song?: string; year?: number | null; hometown?: string } = {}): string {
  switch (kind) {
    case "song":
      return opts.song ? `This is ${title}. One of the songs people loved was “${opts.song}”. Shall we listen together?` : `This is ${title}. Lots of people loved this music. Shall we listen together?`;
    case "film_clip":
      return `This is ${title}${opts.year ? `, from ${opts.year}` : ""}. Would you like to watch a little of it with me?`;
    case "tv_clip":
      return `This is ${title}. It made a lot of people smile. Shall we watch a bit?`;
    case "place":
      return `This is ${title}${opts.hometown ? `, near ${opts.hometown}` : ""}. Shall we look at it together?`;
    case "food":
      return `This is ${title}. Shall we look at the food together? You can tell me if it looks good.`;
    case "book":
      return `This is ${title}. Shall we look at the cover together?`;
  }
}

function songMedia(item: ProfileItem, song: string | undefined): Media {
  const m: Media = { ...(item.media ?? {}) };
  if (song && song !== m.song) {
    m.song = song;
    m.youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.name} ${song}`)}`;
    delete m.youtubeId; // the cached video was for a different song
  }
  return m;
}

export function toSessionItem(item: ProfileItem, prompt: string, song: string | undefined, hometown: string): SessionItem {
  const kind = KIND_FOR_DOMAIN[item.domain];
  const chosenSong = kind === "song" ? (song && item.data.notableSongs?.includes(song) ? song : (item.media?.song ?? item.data.notableSongs?.[0])) : undefined;
  const safe = prompt && isSafePrompt(prompt) ? prompt.trim() : fallbackPrompt(kind, item.name, { song: chosenSong, year: item.year, hometown });
  return {
    kind,
    entityId: item.entity_id,
    title: item.name,
    year: kind === "song" ? null : item.year,
    media: kind === "song" ? songMedia(item, chosenSong) : { ...(item.media ?? {}) },
    why: { seedNames: item.why.map((w) => w.name), scores: item.why.map((w) => w.score) },
    prompt: safe,
    durationSec: DEFAULT_DURATION[kind],
  };
}

/** Intake seeds are known favourites; sessions use at most this many so the rest are discoveries. */
export const MAX_SEED_ITEMS = 2;
export const isSeedItem = (i: ProfileItem) => i.status === "promoted" && i.why.length === 0;

/**
 * Turns the model's picks into a validated plan. Unknown or excluded entityIds
 * are dropped; if fewer than 6 survive, the deterministic composer fills in.
 */
export function finalizePlan(model: ModelPlan | null, items: ProfileItem[], hometown: string, firstName: string): { plan: SessionPlan; dropped: string[] } {
  const usable = new Map(items.filter((i) => i.status !== "excluded").map((i) => [i.entity_id, i]));
  const seen = new Set<string>();
  const dropped: string[] = [];
  const picked: SessionItem[] = [];
  let seeds = 0;

  for (const m of model?.items ?? []) {
    const item = usable.get(m.entityId);
    if (!item || seen.has(m.entityId)) {
      dropped.push(m.entityId);
      continue;
    }
    if (isSeedItem(item) && seeds >= MAX_SEED_ITEMS) continue;
    if (isSeedItem(item)) seeds++;
    seen.add(m.entityId);
    picked.push(toSessionItem(item, m.prompt, m.song, hometown));
  }

  if (picked.length < 6) {
    for (const s of composeFallback(items, hometown, 8)) {
      if (picked.length >= 7) break;
      const item = usable.get(s.entityId)!;
      if (seen.has(s.entityId) || (isSeedItem(item) && seeds >= MAX_SEED_ITEMS)) continue;
      if (isSeedItem(item)) seeds++;
      seen.add(s.entityId);
      picked.push(s);
    }
  }

  const plan = SessionPlanSchema.parse({
    title: model?.title?.trim() || `${firstName}’s session`,
    intro: model?.intro?.trim() || "A gentle mix of music, pictures and tastes from the years that matter most.",
    items: picked.slice(0, 8),
  });
  return { plan, dropped };
}

/** Deterministic arc: strongest song first, variety in the middle, a calm song to close. */
export function composeFallback(items: ProfileItem[], hometown: string, size = 7): SessionItem[] {
  const pool = items.filter((i) => i.status !== "excluded").sort((a, b) => b.weight - a.weight);
  const music = pool.filter((i) => i.domain === "music");
  // Opener may be a seed; everything after prefers Encore's discoveries.
  const discoveriesFirst = (list: ProfileItem[]) => [...list.filter((i) => !isSeedItem(i)), ...list.filter(isSeedItem)];
  const others = discoveriesFirst(pool.filter((i) => i.domain !== "music"));
  music.splice(1, music.length, ...discoveriesFirst(music.slice(1)));
  const order: ProfileItem[] = [];
  if (music[0]) order.push(music[0]);
  const byDomain = (d: Domain) => others.filter((i) => i.domain === d);
  const middle = [byDomain("film")[0], music[1], byDomain("tv")[0], byDomain("food")[0], byDomain("place")[0], music[2], byDomain("book")[0]].filter(Boolean) as ProfileItem[];
  for (const m of middle) if (order.length < size - 1 && !order.includes(m)) order.push(m);
  const closer = music.find((m) => !order.includes(m));
  if (closer) order.push(closer);
  for (const p of pool) if (order.length < size && !order.includes(p)) order.push(p);
  return order.map((i) => toSessionItem(i, "", undefined, hometown));
}

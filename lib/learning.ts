/**
 * The learning loop is deterministic. The LLM only explains it afterwards.
 *
 *   sang_along +2, lit_up +1, neutral 0, upset → excluded forever.
 *   Liked items reaching weight 2 are promoted into the Qloo signal (max 3 per session).
 *   An upsetting film/TV/book also proposes its strongest genre tag for exclusion,
 *   unless something they enjoyed shares it.
 */

export const REACTIONS = ["lit_up", "sang_along", "neutral", "upset"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_WEIGHT: Record<Exclude<Reaction, "upset">, number> = { sang_along: 2, lit_up: 1, neutral: 0 };
export const PROMOTE_AT = 2;
export const MAX_PROMOTIONS_PER_SESSION = 3;

export interface LearnItem {
  entityId: string;
  name: string;
  domain: string;
  weight: number;
  status: "active" | "promoted" | "excluded";
  tags: { id: string; name: string }[];
}

export interface LearnResult {
  updates: { entityId: string; weight: number; status: LearnItem["status"] }[];
  promoted: { entityId: string; name: string; reaction: Reaction }[];
  excluded: { entityId: string; name: string }[];
  excludeTags: { id: string; name: string; because: string }[];
  liked: { entityId: string; name: string; reaction: Reaction }[];
  neutral: { entityId: string; name: string }[];
}

/** Last reaction per item wins (a caregiver may correct a tap). */
export function latestReactions(rows: { entityId: string; reaction: Reaction; createdAt: string }[]): Map<string, Reaction> {
  const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out = new Map<string, Reaction>();
  for (const r of sorted) out.set(r.entityId, r.reaction);
  return out;
}

const STRONG_TAG = /:genre:|:subgenre:/;

export function applyReactions(items: LearnItem[], reactions: Map<string, Reaction>): LearnResult {
  const byId = new Map(items.map((i) => [i.entityId, { ...i }]));
  const result: LearnResult = { updates: [], promoted: [], excluded: [], excludeTags: [], liked: [], neutral: [] };

  for (const [entityId, reaction] of reactions) {
    const item = byId.get(entityId);
    if (!item || item.status === "excluded") continue;
    if (reaction === "upset") {
      item.status = "excluded";
      result.excluded.push({ entityId, name: item.name });
    } else {
      item.weight += REACTION_WEIGHT[reaction];
      if (reaction === "neutral") result.neutral.push({ entityId, name: item.name });
      else result.liked.push({ entityId, name: item.name, reaction });
    }
  }

  const candidates = [...byId.values()]
    .filter((i) => i.status === "active" && i.weight >= PROMOTE_AT && reactions.has(i.entityId) && reactions.get(i.entityId) !== "neutral")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_PROMOTIONS_PER_SESSION);
  for (const c of candidates) {
    c.status = "promoted";
    result.promoted.push({ entityId: c.entityId, name: c.name, reaction: reactions.get(c.entityId)! });
  }

  const likedTagIds = new Set([...byId.values()].filter((i) => i.status !== "excluded" && i.weight > 0).flatMap((i) => i.tags.map((t) => t.id)));
  for (const ex of result.excluded) {
    const item = byId.get(ex.entityId)!;
    if (item.domain === "food" || item.domain === "place") continue;
    const tag = item.tags.find((t) => STRONG_TAG.test(t.id) && !likedTagIds.has(t.id) && !result.excludeTags.some((x) => x.id === t.id));
    if (tag) result.excludeTags.push({ ...tag, because: item.name });
  }

  for (const [entityId, original] of items.map((i) => [i.entityId, i] as const)) {
    const now = byId.get(entityId)!;
    if (now.weight !== original.weight || now.status !== original.status) result.updates.push({ entityId, weight: now.weight, status: now.status });
  }
  return result;
}

/** Plain-language fallback for the "What I learned" card if the LLM is unavailable. */
export function describeLearning(firstName: string, r: LearnResult): string {
  const parts: string[] = [];
  const sang = r.liked.filter((l) => l.reaction === "sang_along").map((l) => l.name);
  const lit = r.liked.filter((l) => l.reaction === "lit_up").map((l) => l.name);
  if (sang.length) parts.push(`${firstName} sang or talked along to ${listJoin(sang)}.`);
  if (lit.length) parts.push(`${listJoin(lit)} lit ${firstName} up.`);
  if (r.promoted.length) parts.push(`I’m using ${listJoin(r.promoted.map((p) => p.name))} to find more like ${r.promoted.length > 1 ? "them" : "it"}.`);
  if (r.excluded.length) parts.push(`${listJoin(r.excluded.map((e) => e.name))} upset ${firstName}, so ${r.excluded.length > 1 ? "they are" : "it is"} out for good.`);
  if (r.excludeTags.length) parts.push(`I’m also steering away from ${listJoin(r.excludeTags.map((t) => t.name.toLowerCase()))}.`);
  if (!parts.length) parts.push(`Nothing stood out strongly today, so tomorrow keeps a similar mix with some fresh picks.`);
  return parts.join(" ");
}

function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

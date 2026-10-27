import { reminiscenceWindow, type EraWindow } from "../era";
import { loadProfileBundle, type AvoidItem, type Profile, type ProfileItem, type Seed } from "../profiles";

/** Applied to film, TV and books on every request (clinical content rules). */
export const DEFAULT_MEDIA_EXCLUDES = [
  "urn:tag:genre:media:war",
  "urn:tag:keyword:qloo:war",
  "urn:tag:subgenre:qloo:war",
  "urn:tag:genre:media:horror",
  "urn:tag:subgenre:qloo:disaster",
  "urn:tag:keyword:qloo:disaster",
  "urn:tag:keyword:qloo:natural_disaster",
  "urn:tag:keyword:qloo:funeral",
  "urn:tag:keyword:qloo:violence",
  "urn:tag:keyword:qloo:serial_killer",
];

export interface SeedRef {
  id: string;
  name: string;
  type: string;
  year: number | null;
}

export interface AgentContext {
  profile: Profile;
  window: EraWindow;
  seeds: Seed[];
  avoid: AvoidItem[];
  items: ProfileItem[];
  /** Entities used as signal.interests.entities: intake seeds plus promoted items. */
  signalSeeds: SeedRef[];
  foodSeeds: { text: string; tagId: string | null }[];
  /** Never recommend these: excluded items, avoid-list entities, and the seeds themselves. */
  excludeEntityIds: string[];
  avoidTagIds: string[];
  /** Entity id → display name, for provenance chips. */
  names: Map<string, string>;
}

export async function loadAgentContext(profile: Profile, mode: "build" | "expand" = "build"): Promise<AgentContext> {
  const { seeds, avoid, items } = await loadProfileBundle(profile.id);
  const entitySeeds: SeedRef[] = seeds
    .filter((s) => s.kind === "entity" && s.entity_id && s.confirmed)
    .map((s) => ({ id: s.entity_id!, name: s.name ?? s.raw_text, type: s.entity_type ?? "", year: s.year }));
  const promoted: SeedRef[] = items
    .filter((i) => i.status === "promoted" && !entitySeeds.some((s) => s.id === i.entity_id))
    .map((i) => ({ id: i.entity_id, name: i.name, type: i.entity_type, year: i.year }));
  const signalSeeds = [...entitySeeds, ...promoted];

  const names = new Map<string, string>();
  for (const s of signalSeeds) names.set(s.id, s.name);

  return {
    profile,
    window: reminiscenceWindow(profile.birth_year),
    seeds,
    avoid,
    items,
    signalSeeds,
    foodSeeds: seeds.filter((s) => s.kind === "food").map((s) => ({ text: s.raw_text, tagId: s.tag_id })),
    excludeEntityIds: [
      ...new Set([
        ...signalSeeds.map((s) => s.id),
        // Expanding: everything already in the profile is excluded so every result is new.
        ...items.filter((i) => mode === "expand" || i.status === "excluded").map((i) => i.entity_id),
        ...avoid.filter((a) => a.entity_id).map((a) => a.entity_id!),
      ]),
    ],
    avoidTagIds: [...new Set(avoid.filter((a) => a.tag_id).map((a) => a.tag_id!))],
    names,
  };
}

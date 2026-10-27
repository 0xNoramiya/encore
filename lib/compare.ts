import type { EraWindow } from "./era";
import type { GenericPlan } from "./agent/generic";
import { isSafePrompt, type SessionPlan } from "./session";

export interface CompareRow {
  label: string;
  generic: string;
  encore: string;
  encoreBetter: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function repeatsSeed(text: string, seeds: string[]): boolean {
  const t = norm(text);
  return seeds.some((s) => {
    const n = norm(s);
    return n.length > 2 && (t.includes(n) || n.includes(t));
  });
}

/** Honest, computed differences between the generic plan and Encore's plan. */
export function compareSessions(generic: GenericPlan, encore: SessionPlan, seeds: string[], seedIds: string[], window: EraWindow, firstName: string): CompareRow[] {
  const g = generic.items;
  const e = encore.items;
  const gUnsafe = g.filter((i) => !isSafePrompt(i.prompt)).length;
  const eUnsafe = e.filter((i) => !isSafePrompt(i.prompt)).length;
  const gRepeat = g.filter((i) => repeatsSeed(`${i.title} ${i.creator ?? ""}`, seeds)).length;
  const eRepeat = e.filter((i) => seedIds.includes(i.entityId)).length;
  const gDated = g.filter((i) => i.year);
  const gEra = gDated.filter((i) => i.year! >= window.start && i.year! <= window.end).length;
  const eDated = e.filter((i) => i.year);
  const eEra = eDated.filter((i) => i.year! >= window.start && i.year! <= window.end).length;
  const eTraceable = e.filter((i) => i.why.seedNames.length || seedIds.includes(i.entityId)).length;
  const ePlayable = e.filter((i) => i.media.spotifyEmbed || i.media.youtubeId || i.media.youtubeSearch || i.media.mapsUrl || i.media.image).length;

  return [
    { label: "Questions that test memory", generic: `${gUnsafe} of ${g.length}`, encore: `${eUnsafe} of ${e.length}`, encoreBetter: eUnsafe < gUnsafe },
    { label: "New finds beyond what you told us", generic: `${g.length - gRepeat} of ${g.length}`, encore: `${e.length - eRepeat} of ${e.length}`, encoreBetter: e.length - eRepeat > g.length - gRepeat },
    { label: `Traceable to ${firstName}’s taste graph`, generic: `0 of ${g.length}`, encore: `${eTraceable} of ${e.length}`, encoreBetter: eTraceable > 0 },
    {
      label: `Dated items from ages 10–30 (${window.start}–${window.end})`,
      generic: `${gEra} of ${gDated.length}`,
      encore: `${eEra} of ${eDated.length}`,
      encoreBetter: eDated.length > 0 && eEra / eDated.length >= (gDated.length ? gEra / gDated.length : 0),
    },
    { label: "Linked to a real player, poster or map", generic: `0 of ${g.length}`, encore: `${ePlayable} of ${e.length}`, encoreBetter: ePlayable > 0 },
  ];
}

/** Splits a prompt into segments, flagging memory-test phrases for highlighting. */
export function flagMemoryTests(prompt: string): { text: string; flagged: boolean }[] {
  const sentences = prompt.match(/[^.?!]+[.?!]*\s*/g) ?? [prompt];
  return sentences.map((s) => ({ text: s, flagged: !isSafePrompt(s) }));
}

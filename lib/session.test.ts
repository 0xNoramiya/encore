import { describe, expect, it } from "vitest";
import type { ProfileItem } from "./profiles";
import { composeFallback, fallbackPrompt, finalizePlan, isSafePrompt, SessionPlanSchema } from "./session";

let n = 0;
const pi = (domain: ProfileItem["domain"], name: string, extra: Partial<ProfileItem> = {}): ProfileItem => ({
  id: `row-${n++}`,
  profile_id: "p",
  entity_id: name.toLowerCase().replace(/\W/g, ""),
  entity_type: "urn:entity:artist",
  domain,
  name,
  year: 1955,
  weight: 0,
  status: "active",
  reason: null,
  why: [{ entityId: "s1", name: "Frank Sinatra", score: 0.3 }],
  media: { image: "https://example.com/x.jpg" },
  data: { notableSongs: domain === "music" ? ["Song A", "Song B"] : undefined },
  added_in_version: 1,
  ...extra,
});

const profile = [
  pi("music", "Singer One", { weight: 1, status: "promoted" }),
  pi("music", "Singer Two"),
  pi("music", "Singer Three"),
  pi("film", "Film One"),
  pi("tv", "Show One"),
  pi("food", "Diner One"),
  pi("place", "Bridge One"),
  pi("book", "Book One"),
  pi("film", "Scary Film", { status: "excluded" }),
];

describe("isSafePrompt", () => {
  it("rejects memory tests", () => {
    for (const p of ["Do you remember this song?", "Can you recall where you saw it?", "What year was this?", "Who is singing this?", "Do you know who this is?"]) {
      expect(isSafePrompt(p), p).toBe(false);
    }
  });
  it("accepts recognition invitations", () => {
    expect(isSafePrompt("This is Frank Sinatra. Lots of people danced to this one. Shall we listen?")).toBe(true);
    expect(isSafePrompt("Would you like tea or coffee while we watch?")).toBe(true);
  });
  it("fallback prompts are themselves safe", () => {
    for (const k of ["song", "film_clip", "tv_clip", "place", "food", "book"] as const) expect(isSafePrompt(fallbackPrompt(k, "X", { song: "Y", year: 1950 }))).toBe(true);
  });
});

describe("finalizePlan", () => {
  it("keeps only real, non-excluded profile items and fills from the profile", () => {
    const { plan, dropped } = finalizePlan(
      {
        title: "An evening in Brooklyn",
        intro: "Songs first.",
        items: [
          { entityId: "singerone", song: "Song B", prompt: "This is Singer One. Shall we listen?" },
          { entityId: "invented-by-llm", prompt: "Made up" },
          { entityId: "scaryfilm", prompt: "Excluded" },
          { entityId: "filmone", prompt: "Do you remember this film?" },
          { entityId: "showone", prompt: "This made people laugh." },
          { entityId: "dinerone", prompt: "Smell the coffee." },
          { entityId: "singertwo", prompt: "A gentle one to finish." },
        ],
      },
      profile,
      "Brooklyn",
      "Dorothy",
    );
    expect(dropped).toEqual(["invented-by-llm", "scaryfilm"]);
    expect(plan.items.map((i) => i.entityId)).not.toContain("scaryfilm");
    expect(plan.items[0]).toMatchObject({ kind: "song", title: "Singer One", media: { song: "Song B" } });
    expect(plan.items.find((i) => i.entityId === "filmone")!.prompt).not.toMatch(/remember/i);
    expect(plan.items.length).toBeGreaterThanOrEqual(6);
    expect(() => SessionPlanSchema.parse(plan)).not.toThrow();
  });

  it("rejects songs not in the artist's notable songs", () => {
    const { plan } = finalizePlan({ title: "t", intro: "i", items: [{ entityId: "singerone", song: "Invented Song", prompt: "Listen." }] }, profile, "Brooklyn", "Dorothy");
    expect(plan.items[0].media.song).toBe("Song A");
  });

  it("falls back to a deterministic plan when the model fails", () => {
    const { plan } = finalizePlan(null, profile, "Brooklyn", "Dorothy");
    expect(plan.items.length).toBe(7);
    expect(plan.items[0].kind).toBe("song");
    expect(plan.items[plan.items.length - 1].kind).toBe("song");
  });
});

describe("seed cap", () => {
  it("uses at most two intake seeds per session", () => {
    const seeds = ["Seed A", "Seed B", "Seed C"].map((name) => pi("music", name, { status: "promoted", weight: 1, why: [] }));
    const items = [...seeds, ...profile];
    const { plan } = finalizePlan(
      { title: "t", intro: "i", items: [...seeds, ...profile.slice(1, 6)].map((x) => ({ entityId: x.entity_id, prompt: "This is it. Shall we listen?" })) },
      items,
      "Brooklyn",
      "Dorothy",
    );
    expect(plan.items.filter((x) => x.title.startsWith("Seed")).length).toBe(2);
  });
});

describe("composeFallback", () => {
  it("opens with the strongest song and never includes excluded items", () => {
    const items = composeFallback(profile, "Brooklyn");
    expect(items[0].entityId).toBe("singerone");
    expect(items.map((i) => i.entityId)).not.toContain("scaryfilm");
    expect(new Set(items.map((i) => i.kind)).size).toBeGreaterThanOrEqual(4);
  });
});

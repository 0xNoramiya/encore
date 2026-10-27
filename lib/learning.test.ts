import { describe, expect, it } from "vitest";
import { applyReactions, describeLearning, latestReactions, type LearnItem, type Reaction } from "./learning";

const item = (entityId: string, domain: string, weight = 0, tags: { id: string; name: string }[] = [], status: LearnItem["status"] = "active"): LearnItem => ({
  entityId,
  name: entityId.toUpperCase(),
  domain,
  weight,
  status,
  tags,
});

const r = (pairs: [string, Reaction][]) => new Map(pairs);

describe("applyReactions", () => {
  it("weights reactions: sang_along +2, lit_up +1, neutral 0", () => {
    const out = applyReactions([item("a", "music"), item("b", "music"), item("c", "film")], r([["a", "sang_along"], ["b", "lit_up"], ["c", "neutral"]]));
    expect(out.updates).toContainEqual({ entityId: "a", weight: 2, status: "promoted" });
    expect(out.updates).toContainEqual({ entityId: "b", weight: 1, status: "active" });
    expect(out.updates.find((u) => u.entityId === "c")).toBeUndefined();
    expect(out.neutral.map((n) => n.entityId)).toEqual(["c"]);
  });

  it("promotes items reaching weight 2, at most three per session", () => {
    const items = ["a", "b", "c", "d"].map((id) => item(id, "music"));
    const out = applyReactions(items, r(items.map((i) => [i.entityId, "sang_along"] as [string, Reaction])));
    expect(out.promoted).toHaveLength(3);
  });

  it("promotes on accumulated weight across sessions", () => {
    const out = applyReactions([item("a", "music", 1)], r([["a", "lit_up"]]));
    expect(out.promoted.map((p) => p.entityId)).toEqual(["a"]);
  });

  it("does not promote already-promoted seeds again", () => {
    const out = applyReactions([item("seed", "music", 1, [], "promoted")], r([["seed", "sang_along"]]));
    expect(out.promoted).toEqual([]);
    expect(out.updates).toContainEqual({ entityId: "seed", weight: 3, status: "promoted" });
  });

  it("excludes upsetting items and proposes their strongest unshared genre tag", () => {
    const thriller = { id: "urn:tag:genre:media:thriller", name: "Thriller" };
    const comedy = { id: "urn:tag:genre:media:comedy", name: "Comedy" };
    const out = applyReactions(
      [item("psycho", "film", 0, [comedy, thriller]), item("lucy", "tv", 0, [comedy])],
      r([["psycho", "upset"], ["lucy", "lit_up"]]),
    );
    expect(out.excluded.map((e) => e.entityId)).toEqual(["psycho"]);
    expect(out.updates).toContainEqual({ entityId: "psycho", weight: 0, status: "excluded" });
    expect(out.excludeTags).toEqual([{ ...thriller, because: "PSYCHO" }]);
  });

  it("never proposes tag exclusions for food or places", () => {
    const out = applyReactions([item("diner", "food", 0, [{ id: "urn:tag:genre:place:restaurant:diner", name: "Diner" }])], r([["diner", "upset"]]));
    expect(out.excludeTags).toEqual([]);
  });

  it("ignores reactions to unknown or already excluded items", () => {
    const out = applyReactions([item("x", "music", 0, [], "excluded")], r([["x", "sang_along"], ["ghost", "upset"]]));
    expect(out.updates).toEqual([]);
    expect(out.excluded).toEqual([]);
  });
});

describe("latestReactions", () => {
  it("keeps the last tap per item", () => {
    const m = latestReactions([
      { entityId: "a", reaction: "neutral", createdAt: "2026-10-28T10:00:00Z" },
      { entityId: "a", reaction: "lit_up", createdAt: "2026-10-28T10:00:05Z" },
    ]);
    expect(m.get("a")).toBe("lit_up");
  });
});

describe("describeLearning", () => {
  it("summarises without pronouns", () => {
    const out = applyReactions([item("ella", "music", 0), item("psycho", "film", 0, [{ id: "urn:tag:genre:media:thriller", name: "Thriller" }])], r([["ella", "sang_along"], ["psycho", "upset"]]));
    const text = describeLearning("Dorothy", out);
    expect(text).toContain("Dorothy sang or talked along to ELLA");
    expect(text).toContain("PSYCHO upset Dorothy");
    expect(text).toContain("thriller");
    expect(text).not.toMatch(/\b(she|he|her|his)\b/i);
  });
});

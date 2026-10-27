import { describe, expect, it } from "vitest";
import { buildReport, type ReportInput } from "./report";

const jazz = { id: "t1", name: "Vocal Jazz" };
const sketch = { id: "t2", name: "Sketch show" };

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  firstName: "Dorothy",
  sessions: [
    {
      id: "s1",
      title: "Sunday",
      createdAt: "2026-10-25T10:00:00Z",
      startedAt: "2026-10-25T10:00:00Z",
      endedAt: "2026-10-25T10:18:00Z",
      plannedMinutes: 17,
      example: true,
      items: [
        { entityId: "ella", kind: "song", title: "Ella Fitzgerald" },
        { entityId: "dean", kind: "song", title: "Dean Martin" },
        { entityId: "burnett", kind: "tv_clip", title: "The Carol Burnett Show" },
        { entityId: "pizza", kind: "food", title: "Joe's Pizza" },
      ],
    },
    {
      id: "s2",
      title: "Monday",
      createdAt: "2026-10-26T10:00:00Z",
      startedAt: "2026-10-26T10:00:00Z",
      endedAt: null,
      plannedMinutes: 16,
      example: false,
      items: [
        { entityId: "ella", kind: "song", title: "Ella Fitzgerald" },
        { entityId: "lucy", kind: "tv_clip", title: "The Lucy Show" },
      ],
    },
    { id: "s3", title: "Unplayed", createdAt: "2026-10-27T10:00:00Z", startedAt: null, endedAt: null, plannedMinutes: 15, example: false, items: [] },
  ],
  reactions: [
    { sessionId: "s1", entityId: "ella", reaction: "neutral", createdAt: "2026-10-25T10:01:00Z" },
    { sessionId: "s1", entityId: "ella", reaction: "sang_along", createdAt: "2026-10-25T10:02:00Z" },
    { sessionId: "s1", entityId: "dean", reaction: "lit_up", createdAt: "2026-10-25T10:05:00Z" },
    { sessionId: "s1", entityId: "burnett", reaction: "upset", createdAt: "2026-10-25T10:08:00Z" },
    { sessionId: "s1", entityId: "pizza", reaction: "neutral", createdAt: "2026-10-25T10:10:00Z" },
    { sessionId: "s2", entityId: "ella", reaction: "sang_along", createdAt: "2026-10-26T10:02:00Z" },
    { sessionId: "s2", entityId: "lucy", reaction: "neutral", createdAt: "2026-10-26T10:06:00Z" },
  ],
  tags: new Map([
    ["ella", [jazz]],
    ["dean", [jazz]],
    ["burnett", [sketch]],
    ["lucy", [sketch]],
  ]),
  keptOut: [
    { name: "The Carol Burnett Show", reason: "upset" },
    { name: "Sketch show", reason: "tag" },
  ],
  ...over,
});

describe("buildReport", () => {
  const r = buildReport(input());

  it("counts played sessions and the latest tap per item", () => {
    expect(r.played).toBe(2);
    expect(r.reacted).toBe(6);
    expect(r.warm).toBe(3);
    expect(r.warmRate).toBeCloseTo(0.5);
  });

  it("ranks kinds by warm share", () => {
    expect(r.byKind[0]).toMatchObject({ kind: "song", reacted: 3, warm: 3 });
    expect(r.byKind.find((k) => k.kind === "tv_clip")).toMatchObject({ reacted: 2, warm: 0, upset: 1, neutral: 1 });
  });

  it("finds best moments and tag patterns", () => {
    expect(r.bestMoments[0]).toMatchObject({ title: "Ella Fitzgerald", sang: 2 });
    expect(r.worksWell.map((t) => t.name)).toEqual(["Vocal Jazz"]);
    expect(r.doesNotLand.map((t) => t.name)).toEqual(["Sketch show"]);
  });

  it("builds an activity log, newest first, with durations when known", () => {
    expect(r.log.map((l) => l.id)).toEqual(["s2", "s1"]);
    expect(r.log[1]).toMatchObject({ minutes: 18, reacted: 4, ofItems: 4, warm: 2, upset: 1, example: true });
    expect(r.log[0].minutes).toBeNull();
    expect(r.hasExamples).toBe(true);
  });

  it("writes a name-only headline", () => {
    expect(r.headline).toContain("Dorothy responded warmly to 3 of 6 items (50%)");
    expect(r.headline).toContain("Music works best (3 of 3)");
    expect(r.headline).toContain("Steer clear of sketch show");
    expect(r.headline).not.toMatch(/\b(she|he|her|his)\b/i);
  });

  it("doesn't let a tiny sample win the headline", () => {
    const songs = ["a", "b", "c", "d"].map((id) => ({ entityId: id, kind: "song" as const, title: id }));
    const food = ["f1", "f2"].map((id) => ({ entityId: id, kind: "food" as const, title: id }));
    const taps: [string, "sang_along" | "lit_up" | "neutral"][] = [["a", "sang_along"], ["b", "lit_up"], ["c", "lit_up"], ["d", "neutral"], ["f1", "lit_up"], ["f2", "lit_up"]];
    const r2 = buildReport(
      input({
        sessions: [{ id: "s", title: "t", createdAt: "2026-10-25T10:00:00Z", startedAt: "2026-10-25T10:00:00Z", endedAt: null, plannedMinutes: 15, example: false, items: [...songs, ...food] }],
        reactions: taps.map(([entityId, reaction], n) => ({ sessionId: "s", entityId, reaction, createdAt: `2026-10-25T10:0${n}:00Z` })),
        tags: new Map(),
        keptOut: [],
      }),
    );
    expect(r2.byKind[0].kind).toBe("food");
    expect(r2.headline).toContain("Music works best (3 of 4)");
  });

  it("has a helpful empty state", () => {
    const empty = buildReport(input({ sessions: [], reactions: [] }));
    expect(empty.played).toBe(0);
    expect(empty.headline).toMatch(/No reactions noted yet/);
  });
});

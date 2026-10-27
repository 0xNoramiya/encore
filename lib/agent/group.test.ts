import { describe, expect, it } from "vitest";
import type { Profile } from "../profiles";
import type { QlooEntity } from "../qloo/types";
import { groupWindow, membersBehind } from "./group";

const ent = (explain: [string, number][]): QlooEntity => ({ id: "x", name: "X", type: "urn:entity:artist", external: {}, tags: [], explain: explain.map(([entityId, score]) => ({ entityId, score })) });

describe("membersBehind", () => {
  const owners = new Map([
    ["s1", { seedId: "s1", seedName: "Frank Sinatra", member: "Dorothy" }],
    ["s2", { seedId: "s2", seedName: "Ella Fitzgerald", member: "Dorothy" }],
    ["s3", { seedId: "s3", seedName: "The Beatles", member: "Margaret" }],
  ]);

  it("lists each resident once, strongest first", () => {
    expect(membersBehind(ent([["s3", 0.4], ["s1", 0.3], ["s2", 0.2]]), owners)).toEqual(["Margaret", "Dorothy"]);
  });

  it("only counts a resident whose seed is among the top three drivers", () => {
    const many = new Map([...owners, ["s4", { seedId: "s4", seedName: "Pedro Infante", member: "Roberto" }], ["s5", { seedId: "s5", seedName: "Los Panchos", member: "Roberto" }]]);
    expect(membersBehind(ent([["s1", 0.22], ["s2", 0.21], ["s4", 0.2], ["s5", 0.19], ["s3", 0.18]]), many)).toEqual(["Dorothy", "Roberto"]);
  });

  it("ignores weak contributions and unknown seeds", () => {
    expect(membersBehind(ent([["s1", 0.5], ["s3", 0.01], ["zz", 0.4]]), owners)).toEqual(["Dorothy"]);
  });
});

describe("groupWindow", () => {
  it("spans everyone's ages 10-30", () => {
    const p = (birth_year: number) => ({ birth_year }) as Profile;
    expect(groupWindow([p(1941), p(1948)], )).toEqual({ start: 1951, end: 1978 });
  });
});

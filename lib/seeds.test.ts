import { describe, expect, it } from "vitest";
import { rankCandidates } from "./seeds";
import type { QlooEntity } from "./qloo/types";

const ent = (id: string, name: string, type: string, year?: number, popularity = 0.9): QlooEntity => ({ id, name, type, year, popularity, external: {}, tags: [], explain: [] });

describe("rankCandidates", () => {
  it("prefers the era-appropriate original over a newer remake", () => {
    const cands = [ent("new", "The Magnificent Seven", "urn:entity:movie", 2016, 0.99), ent("old", "The Magnificent Seven", "urn:entity:movie", 1960, 0.95)];
    expect(rankCandidates(cands, "The Magnificent Seven", { start: 1956, end: 1976 })[0].id).toBe("old");
  });

  it("keeps Qloo order when there is no era signal", () => {
    const cands = [ent("a", "Koes Plus", "urn:entity:artist"), ent("b", "The Bad Plus", "urn:entity:artist")];
    expect(rankCandidates(cands, "Koes Plus")[0].id).toBe("a");
  });

  it("puts exact name matches first", () => {
    const cands = [ent("jr", "Frank Sinatra, Jr.", "urn:entity:artist", 1960), ent("sr", "Frank Sinatra", "urn:entity:artist", 1935)];
    expect(rankCandidates(cands, "frank sinatra", { start: 1951, end: 1971 })[0].id).toBe("sr");
  });
});

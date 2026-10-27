// Synthetic fixtures only: real Qloo responses must never be committed.
import { describe, expect, it, vi } from "vitest";
import { createQlooClient, memoryCache, QlooApiError } from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fakeInsights = {
  success: true,
  results: {
    entities: [
      {
        name: "Test Singer",
        entity_id: "AAA",
        type: "urn:entity",
        subtype: "urn:entity:artist",
        popularity: 0.9,
        properties: { start_year: 1950, image: { url: "https://example.com/a.jpg" }, notable_songs: ["Song A"] },
        external: { spotify: [{ id: "sp1" }], imdb: [{ id: "nm1" }] },
        tags: [{ id: "urn:tag:genre:jazz", name: "Jazz", type: "urn:tag:genre" }],
        query: {
          affinity: 0.8,
          explainability: { "signal.interests.entities": [{ entity_id: "S2", score: 0.3 }, { entity_id: "S1", score: 0.7 }] },
        },
      },
    ],
  },
  query: { explainability: { "signal.interests.entities": { effect_on_all_recs: [{ entity_id: "S1", avg_score: 0.7 }] } } },
};

describe("qloo client", () => {
  it("sends X-Api-Key, forces explainability and normalizes entities", async () => {
    const fetch = vi.fn().mockResolvedValue(json(fakeInsights));
    const qloo = createQlooClient({ apiKey: "k", baseUrl: "https://q.test", fetch });
    const { data, trace } = await qloo.insights({ "filter.type": "urn:entity:artist", "signal.interests.entities": "S1,S2" });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("https://q.test/v2/insights?");
    expect(url).toContain("feature.explainability=true");
    expect(init.headers["X-Api-Key"]).toBe("k");

    expect(data.entities[0]).toMatchObject({
      id: "AAA",
      type: "urn:entity:artist",
      year: 1950,
      image: "https://example.com/a.jpg",
      external: { spotify: "sp1", imdb: "nm1" },
      explain: [
        { entityId: "S1", score: 0.7 },
        { entityId: "S2", score: 0.3 },
      ],
    });
    expect(data.aggregate?.all).toEqual([{ entityId: "S1", score: 0.7 }]);
    expect(trace).toMatchObject({ endpoint: "/v2/insights", count: 1, cached: false });
  });

  it("normalizes search-shaped external ids (object, not array)", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({ results: [{ name: "X", entity_id: "X1", types: ["urn:entity:movie"], properties: { release_year: 1953, external: { imdb: { id: "tt1" } } } }] }),
    );
    const qloo = createQlooClient({ apiKey: "k", fetch });
    const { data } = await qloo.search("x", { types: "urn:entity:movie" });
    expect(data[0]).toMatchObject({ id: "X1", type: "urn:entity:movie", year: 1953, external: { imdb: "tt1" } });
  });

  it("serves repeat requests from cache", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(fakeInsights)));
    const qloo = createQlooClient({ apiKey: "k", fetch, cache: memoryCache() });
    const params = { "filter.type": "urn:entity:artist", "signal.interests.entities": "S1" };
    await qloo.insights(params);
    const second = await qloo.insights(params);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second.trace.cached).toBe(true);
  });

  it("validates params before calling the API", async () => {
    const fetch = vi.fn();
    const qloo = createQlooClient({ apiKey: "k", fetch });
    await expect(qloo.insights({ "filter.type": "urn:entity:artist", "filter.release_year.min": 1950 })).rejects.toThrow(/not supported/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps 401 to an auth error without retrying", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: { message: "Unauthorized" } }, 401));
    const qloo = createQlooClient({ apiKey: "bad", fetch });
    const err = await qloo.search("x").catch((e) => e);
    expect(err).toBeInstanceOf(QlooApiError);
    expect(err.kind).toBe("auth");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("surfaces Qloo's validation messages on 400", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ errors: [{ path: "take", message: "take must be an integer value between 1 and 50" }] }, 400));
    const qloo = createQlooClient({ apiKey: "k", fetch });
    await expect(qloo.search("x")).rejects.toThrow(/take: take must be/);
  });

  it("retries 5xx then succeeds", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ results: [] }));
    const qloo = createQlooClient({ apiKey: "k", fetch, retries: 1 });
    const { data } = await qloo.search("x");
    expect(data).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import { QlooParamError, validateInsightsParams } from "./params";

const seeds = "11111111-1111-1111-1111-111111111111";

describe("validateInsightsParams", () => {
  it("accepts a valid movie query with era + country filters", () => {
    const p = {
      "filter.type": "urn:entity:movie",
      "signal.interests.entities": seeds,
      "signal.demographics.age": "55_and_older",
      "filter.release_year.min": 1951,
      "filter.release_year.max": 1971,
      "filter.release_country": "United States",
      "feature.explainability": true,
      take: 10,
    };
    expect(validateInsightsParams(p)).toEqual(p);
  });

  it("rejects release_year on artists (silently ignored by Qloo)", () => {
    expect(() =>
      validateInsightsParams({ "filter.type": "urn:entity:artist", "signal.interests.entities": seeds, "filter.release_year.min": 1950 }),
    ).toThrow(/filter.release_year.min.*not supported for urn:entity:artist/);
  });

  it("rejects release_year on books and accepts publication_year", () => {
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:book", "filter.release_year.min": 1950 })).toThrow(QlooParamError);
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:book", "filter.publication_year.min": 1950 })).not.toThrow();
  });

  it("rejects location filters on non-geo types", () => {
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:movie", "filter.location": "POINT(-73.9 40.6)" })).toThrow(QlooParamError);
  });

  it("accepts place location as WKT (lon first) or locality ID", () => {
    expect(() =>
      validateInsightsParams({ "filter.type": "urn:entity:place", "filter.location": "POINT(-73.9442 40.6782)", "filter.location.radius": 8000 }),
    ).not.toThrow();
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:place", "filter.location": seeds })).not.toThrow();
  });

  it("catches lat/lon swapped past valid ranges", () => {
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:place", "filter.location": "POINT(40.6 -173.9)" })).toThrow(/longitude comes first/);
  });

  it("rejects ISO country codes for release_country", () => {
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:movie", "filter.release_country": "US" })).toThrow(/full country name/);
  });

  it("rejects unknown age buckets and out-of-range take", () => {
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:artist", "signal.demographics.age": "60_plus" })).toThrow(/valid bucket/);
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:artist", take: 100 })).toThrow(/take/);
  });

  it("requires a known filter.type", () => {
    expect(() => validateInsightsParams({ "filter.type": "urn:entity:music" })).toThrow(/filter.type/);
    expect(() => validateInsightsParams({})).toThrow(/filter.type/);
  });

  it("strips bad params instead of throwing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = validateInsightsParams({ "filter.type": "urn:entity:artist", "filter.release_year.min": 1950, take: 5 });
    expect(out).toEqual({ "filter.type": "urn:entity:artist", take: 5 });
    expect(warn).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
    warn.mockRestore();
  });
});

import { describe, expect, it } from "vitest";
import { artistOverlapsWindow, decadesLabel, reminiscenceWindow } from "./era";

describe("reminiscenceWindow", () => {
  it("is birthYear+10 to birthYear+30", () => {
    expect(reminiscenceWindow(1941, 2026)).toEqual({ start: 1951, end: 1971 });
  });

  it("caps the end at the current year", () => {
    expect(reminiscenceWindow(2000, 2026)).toEqual({ start: 2010, end: 2026 });
  });

  it("rejects implausible birth years", () => {
    expect(() => reminiscenceWindow(1850, 2026)).toThrow(RangeError);
    expect(() => reminiscenceWindow(2020, 2026)).toThrow(RangeError);
    expect(() => reminiscenceWindow(1941.5, 2026)).toThrow(RangeError);
  });
});

describe("decadesLabel", () => {
  it("lists the decades the window touches", () => {
    expect(decadesLabel({ start: 1951, end: 1971 })).toBe("the '50s, '60s and '70s");
    expect(decadesLabel({ start: 1960, end: 1969 })).toBe("the '60s");
    expect(decadesLabel({ start: 1995, end: 2010 })).toBe("the '90s, '00s and '10s");
  });
});

describe("artistOverlapsWindow", () => {
  const w = { start: 1951, end: 1971 };
  it("keeps artists active during the window", () => {
    expect(artistOverlapsWindow(1937, undefined, w)).toBe(true);
    expect(artistOverlapsWindow(1914, 1971, w)).toBe(true);
  });
  it("drops artists who started after the window", () => {
    expect(artistOverlapsWindow(1993, undefined, w)).toBe(false);
  });
  it("drops artists whose career ended before it", () => {
    expect(artistOverlapsWindow(1920, 1945, w)).toBe(false);
  });
  it("keeps artists with an unknown start year", () => {
    expect(artistOverlapsWindow(undefined, undefined, w)).toBe(true);
  });
});

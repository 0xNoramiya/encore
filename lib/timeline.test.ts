import { describe, expect, it } from "vitest";
import { layoutLane, ticks, yearToX, zoomAxis } from "./timeline";

const axis = zoomAxis({ start: 1951, end: 1971 }); // 1948..1975
const opts = { itemPx: 64, minWidthPx: 880 };

describe("timeline layout", () => {
  it("pads the reminiscence window", () => {
    expect(axis).toEqual({ start: 1948, end: 1975 });
  });

  it("places items by year, left to right", () => {
    const { placed } = layoutLane([{ id: "b", year: 1967 }, { id: "a", year: 1953 }], axis, opts);
    expect(placed.map((p) => p.item.id)).toEqual(["a", "b"]);
    expect(placed[0].x).toBeCloseTo(yearToX(1953, axis));
    expect(placed.every((p) => p.row === 0)).toBe(true);
  });

  it("stacks items that would overlap into the next row", () => {
    const { placed, overflow } = layoutLane([{ id: "a", year: 1957 }, { id: "b", year: 1957 }, { id: "c", year: 1958 }, { id: "d", year: 1962 }], axis, opts);
    expect(placed.map((p) => [p.item.id, p.row])).toEqual([["a", 0], ["b", 1], ["d", 0]]);
    expect(overflow.map((o) => o.id)).toEqual(["c"]);
  });

  it("reports what doesn't fit or falls outside the axis", () => {
    const crowd = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, year: 1960 }));
    const { placed, overflow } = layoutLane([...crowd, { id: "late", year: 1990 }], axis, opts);
    expect(placed).toHaveLength(2);
    expect(overflow.map((o) => o.id)).toContain("late");
    expect(overflow).toHaveLength(4);
  });

  it("puts ticks on round years", () => {
    expect(ticks(axis)).toEqual([1950, 1955, 1960, 1965, 1970]);
  });
});

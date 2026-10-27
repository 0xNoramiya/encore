/**
 * Layout for the "years" picture: items placed by year on a zoomed axis around
 * the reminiscence window, stacked into rows so covers never overlap.
 * Positions are percentages of the axis; collisions are computed against the
 * narrowest width the timeline renders at, so wider screens only add space.
 */
import type { EraWindow } from "./era";

export interface TimelineInput {
  id: string;
  year: number;
}

export interface Placed<T extends TimelineInput> {
  item: T;
  /** Centre of the item, as a percentage of the axis. */
  x: number;
  row: number;
}

export interface Axis {
  start: number;
  end: number;
}

export const zoomAxis = (w: EraWindow, pad = 3): Axis => ({ start: w.start - pad, end: w.end + pad + 1 });

export const yearToX = (year: number, axis: Axis) => ((year + 0.5 - axis.start) / (axis.end - axis.start)) * 100;

export function layoutLane<T extends TimelineInput>(
  items: T[],
  axis: Axis,
  { itemPx, minWidthPx, gapPx = 6, maxRows = 2 }: { itemPx: number; minWidthPx: number; gapPx?: number; maxRows?: number },
): { placed: Placed<T>[]; overflow: T[] } {
  const widthPct = ((itemPx + gapPx) / minWidthPx) * 100;
  const rowsRight: number[] = Array.from({ length: maxRows }, () => -Infinity);
  const placed: Placed<T>[] = [];
  const overflow: T[] = [];
  const inRange = items.filter((i) => i.year >= axis.start && i.year < axis.end).sort((a, b) => a.year - b.year);

  for (const item of inRange) {
    const x = yearToX(item.year, axis);
    const left = x - widthPct / 2;
    const row = rowsRight.findIndex((right) => left >= right);
    if (row === -1) {
      overflow.push(item);
      continue;
    }
    rowsRight[row] = x + widthPct / 2;
    placed.push({ item, x, row });
  }
  return { placed, overflow: [...overflow, ...items.filter((i) => i.year < axis.start || i.year >= axis.end)] };
}

/** Ticks every `step` years inside the axis. */
export function ticks(axis: Axis, step = 5): number[] {
  const out: number[] = [];
  for (let y = Math.ceil(axis.start / step) * step; y < axis.end; y += step) out.push(y);
  return out;
}

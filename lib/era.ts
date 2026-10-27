/**
 * Reminiscence window: people's most vivid, most rehearsed memories come from
 * roughly ages 10-30 (the "reminiscence bump"). Everything era-scoped in Encore
 * is computed from this, deterministically.
 */

export interface EraWindow {
  start: number;
  end: number;
}

export function reminiscenceWindow(birthYear: number, currentYear = new Date().getFullYear()): EraWindow {
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear - 10) {
    throw new RangeError(`birthYear must be an integer between 1900 and ${currentYear - 10}`);
  }
  return { start: birthYear + 10, end: Math.min(birthYear + 30, currentYear) };
}

/** "the '50s and '60s" style label for summaries and UI. */
export function decadesLabel({ start, end }: EraWindow): string {
  const decades: number[] = [];
  for (let d = Math.floor(start / 10) * 10; d <= end; d += 10) decades.push(d);
  const fmt = (d: number) => `'${String(d % 100).padStart(2, "0")}s`;
  if (decades.length === 1) return `the ${fmt(decades[0])}`;
  return `the ${decades.slice(0, -1).map(fmt).join(", ")} and ${fmt(decades[decades.length - 1])}`;
}

/**
 * Artists have no release-year filter in Qloo, but entities carry start_year
 * (career start) and sometimes end_year. Keep artists whose career overlaps the
 * window. Unknown start years pass, since dropping them would hurt thin catalogs
 * (e.g. Indonesian artists) more than it helps.
 */
export function artistOverlapsWindow(startYear: number | undefined, endYear: number | undefined, w: EraWindow): boolean {
  if (startYear === undefined) return true;
  if (startYear > w.end) return false;
  if (endYear !== undefined && endYear < w.start) return false;
  return true;
}

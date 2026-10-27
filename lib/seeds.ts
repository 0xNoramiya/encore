import type { EraWindow } from "./era";
import type { QlooEntity } from "./qloo/types";

/**
 * Era-aware ordering for intake candidates. Qloo search is relevance-ordered
 * and happily returns a 2016 remake ahead of the 1960 original; someone born
 * in 1946 almost certainly means the original. The caregiver still confirms.
 */
export function rankCandidates(cands: QlooEntity[], query: string, window?: EraWindow): QlooEntity[] {
  const q = query.trim().toLowerCase();
  const score = (e: QlooEntity, i: number) => {
    let s = 1 - i * 0.1 + (e.popularity ?? 0) * 0.3;
    const name = e.name.toLowerCase();
    if (name === q) s += 0.5;
    else if (name.startsWith(q) || q.startsWith(name)) s += 0.2;
    if (window && e.year) {
      if (e.type === "urn:entity:artist") s += e.year <= window.end ? 0.3 : -0.3;
      else if (e.year >= window.start - 25 && e.year <= window.end + 5) s += 0.6;
      else if (e.year > window.end + 5) s -= 0.4;
    }
    return s;
  };
  return cands
    .map((e, i) => ({ e, s: score(e, i) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.e);
}

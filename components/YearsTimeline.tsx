import type { EraWindow } from "@/lib/era";
import type { ProfileItem } from "@/lib/profiles";
import { layoutLane, ticks, yearToX, zoomAxis } from "@/lib/timeline";

const MIN_WIDTH = 880;
const POSTER = { w: 64, h: 96 };
const ROW_GAP = 12;
const isSeed = (i: ProfileItem) => i.status === "promoted" && !i.why.length;

/**
 * The reminiscence window as a picture: films, shows and books from the
 * profile placed at their years, with the singers of those years alongside.
 */
export function YearsTimeline({ firstName, window, items }: { firstName: string; window: EraWindow; items: ProfileItem[] }) {
  const axis = zoomAxis(window);
  const visible = items.filter((i) => i.status !== "excluded");
  const dated = (domains: string[]) => visible.filter((i) => domains.includes(i.domain) && i.year).map((i) => ({ id: i.id, year: i.year!, item: i }));
  const screen = layoutLane(dated(["film", "tv"]), axis, { itemPx: POSTER.w, minWidthPx: MIN_WIDTH, maxRows: 2 });
  const shelf = layoutLane(dated(["book"]), axis, { itemPx: POSTER.w, minWidthPx: MIN_WIDTH, maxRows: 1 });
  const radio = visible.filter((i) => i.domain === "music").slice(0, 9);
  if (!screen.placed.length && !radio.length) return null;

  const bandLeft = yearToX(window.start, axis) - (0.5 / (axis.end - axis.start)) * 100;
  const bandRight = yearToX(window.end, axis) + (0.5 / (axis.end - axis.start)) * 100;
  const screenRows = Math.max(1, ...screen.placed.map((p) => p.row + 1));
  const laneLabel = "mb-2 text-sm font-bold text-ink";

  const Poster = ({ item, x, row }: { item: ProfileItem; x: number; row: number }) => {
    const src = item.media?.image ?? item.data.image;
    return (
      <li className="absolute" style={{ left: `calc(${x}% - ${POSTER.w / 2}px)`, top: row * (POSTER.h + ROW_GAP + 18), width: POSTER.w }}>
        {src ? (
          <img
            src={src}
            alt={`${item.name}, ${item.year}`}
            title={`${item.name} (${item.year})`}
            loading="lazy"
            className={`h-24 w-16 rounded bg-rule object-cover shadow-[0_6px_14px_-8px_rgba(36,33,29,0.6)] ${isSeed(item) ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : ""}`}
          />
        ) : (
          <div className="flex h-24 w-16 items-end rounded bg-ink p-1.5 text-[10px] leading-tight text-paper" title={item.name}>
            {item.name}
          </div>
        )}
        <span className="mt-1 block text-center text-xs tabular-nums text-muted">{item.year}</span>
      </li>
    );
  };
  const hidden = screen.overflow.filter((o) => o.year >= axis.start && o.year < axis.end).length;

  return (
    <section className="border-t border-rule py-10" aria-labelledby="years-heading">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="years-heading" className="font-display text-3xl">
          {firstName}’s years
        </h2>
        <p className="text-sm text-muted">
          Encore’s picks, placed in the years {firstName} was 10 to 30. <span className="whitespace-nowrap">Ringed: what you told us.</span>
          {hidden > 0 && <span className="whitespace-nowrap"> {hidden} more from busy years in the lists below.</span>}
        </p>
      </div>

      <div className="-mx-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
        <div className="relative" style={{ minWidth: MIN_WIDTH }}>
          <div
            className="pointer-events-none absolute inset-y-0 rounded-md bg-accent-soft/70"
            style={{ left: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }}
            aria-hidden
          />

          <div className="relative px-0 pt-3">
            <p className={`${laneLabel} relative pl-2`}>On screen</p>
            <ul className="relative" style={{ height: screenRows * (POSTER.h + ROW_GAP + 18) }} aria-label="Films and television by year">
              {screen.placed.map((p) => (
                <Poster key={p.item.id} item={p.item.item} x={p.x} row={p.row} />
              ))}
            </ul>

            {radio.length > 0 && (
              <>
                <p className={`${laneLabel} relative mt-4 pl-2`}>On the radio through these years</p>
                <ul
                  className="relative flex h-16 items-center justify-between"
                  style={{ marginLeft: `${bandLeft}%`, width: `${bandRight - bandLeft}%` }}
                  aria-label="Singers and bands"
                >
                  {radio.map((m) => {
                    const src = m.media?.image ?? m.data.image;
                    return (
                      <li key={m.id}>
                        {src ? (
                          <img
                            src={src}
                            alt={m.name}
                            title={m.name}
                            loading="lazy"
                            className={`h-14 w-14 rounded-full bg-rule object-cover ${isSeed(m) ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : ""}`}
                          />
                        ) : (
                          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-xs text-paper" title={m.name}>
                            {m.name.slice(0, 2)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {shelf.placed.length > 0 && (
              <>
                <p className={`${laneLabel} relative mt-5 pl-2`}>On the shelf</p>
                <ul className="relative" style={{ height: POSTER.h + 18 }} aria-label="Books by year">
                  {shelf.placed.map((p) => (
                    <Poster key={p.item.id} item={p.item.item} x={p.x} row={0} />
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="relative mt-4 h-10 border-t border-ink/40" aria-hidden>
            {ticks(axis).map((y) => (
              <span
                key={y}
                className="absolute top-0 -translate-x-1/2 text-xs tabular-nums text-muted"
                style={{ left: `${yearToX(y, axis) - (0.5 / (axis.end - axis.start)) * 100}%` }}
              >
                <span className="mx-auto block h-2 w-px bg-ink/40" />
                {y}
              </span>
            ))}
            <span className="absolute top-5 -translate-x-1/2 text-xs font-bold text-accent" style={{ left: `${bandLeft}%` }}>
              age 10
            </span>
            <span className="absolute top-5 -translate-x-1/2 text-xs font-bold text-accent" style={{ left: `${bandRight}%` }}>
              age 30
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

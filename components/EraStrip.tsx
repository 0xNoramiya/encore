import type { EraWindow } from "@/lib/era";

/**
 * A lifeline from birth to today with the reminiscence window marked: the
 * years Encore draws from.
 */
export function EraStrip({ birthYear, window, firstName }: { birthYear: number; window: EraWindow; firstName: string }) {
  const now = new Date().getFullYear();
  const span = now - birthYear;
  const pos = (y: number) => `${((y - birthYear) / span) * 100}%`;
  const decades: number[] = [];
  for (let d = Math.ceil(birthYear / 10) * 10; d < now; d += 10) decades.push(d);

  return (
    <figure className="w-full" aria-label={`${firstName}'s lifeline from ${birthYear} to today, with ${window.start} to ${window.end} highlighted`}>
      <div className="relative h-16">
        <div className="absolute inset-x-0 top-8 h-px bg-ink/40" />
        <div
          className="absolute top-5 flex h-7 items-center justify-center overflow-hidden rounded-sm bg-accent text-xs font-bold whitespace-nowrap text-paper"
          style={{ left: pos(window.start), width: `calc(${pos(window.end)} - ${pos(window.start)})` }}
        >
          <span className="hidden sm:inline">ages 10–30</span>
        </div>
        {decades.map((d) => (
          <div key={d} className="absolute top-8 -translate-x-1/2" style={{ left: pos(d) }}>
            <div className="mx-auto h-2 w-px bg-ink/40" />
            <div className={`mt-1 text-xs tabular-nums text-muted ${d % 20 === 0 ? "" : "hidden sm:block"}`}>{d}</div>
          </div>
        ))}
        <div className="absolute left-0 top-0 text-xs font-bold text-ink">Born {birthYear}</div>
        <div className="absolute right-0 top-0 text-xs font-bold text-ink">Today</div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        <span className="font-bold text-accent">
          {window.start}–{window.end}
        </span>{" "}
        is when {firstName} was 10 to 30, the years memories hold onto most. Encore draws from here.
      </figcaption>
    </figure>
  );
}

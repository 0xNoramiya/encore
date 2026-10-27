import type { Why } from "@/lib/profiles";

/** "Because Dorothy loved Frank Sinatra 0.27": straight from Qloo's explainability scores. */
export function Provenance({ why, firstName, compact = false }: { why: Why[]; firstName: string; compact?: boolean }) {
  if (!why.length) return null;
  const shown = why.slice(0, compact ? 2 : 3);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" title="Qloo explainability: how much each of the things they loved contributed to this pick">
      <span className="text-muted">Because {firstName} loved</span>
      {shown.map((w) => (
        <span key={w.entityId} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-ink">
          {w.name}
          <span className="inline-block h-1.5 w-8 overflow-hidden rounded-full bg-accent/20" aria-hidden>
            <span className="block h-full bg-accent" style={{ width: `${Math.round(Math.min(1, w.score / 0.5) * 100)}%` }} />
          </span>
          <span className="tabular-nums text-muted">{w.score.toFixed(2)}</span>
        </span>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { AgentStep } from "@/lib/profiles";

function QlooCall({ call }: { call: NonNullable<AgentStep["qloo"]>[number] }) {
  const params = Object.entries(call.params);
  return (
    <div className="mt-2 rounded-md border border-rule bg-paper p-3 font-mono text-xs leading-relaxed text-ink/80">
      <div className="mb-1 flex flex-wrap gap-x-3 font-bold text-ink">
        <span>GET {call.endpoint}</span>
        <span className="font-normal text-muted">
          {call.count} results, {call.cached ? "cached" : `${call.ms} ms`}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 break-all">
        {params.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Step({ step, n, live }: { step: AgentStep; n: number; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (step.kind === "thought") {
    return (
      <li className={`py-2 pl-9 font-display text-base italic text-ink/80 ${live ? "animate-rise" : ""}`}>
        “{step.label.trim()}”
      </li>
    );
  }
  const hasDetail = Boolean(step.qloo?.length || step.input);
  return (
    <li className={`relative py-2.5 pl-9 ${live ? "animate-rise" : ""}`}>
      <span
        className={`absolute left-0 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
          step.status === "running" ? "border-2 border-accent text-accent" : step.status === "error" ? "bg-ink/20 text-ink" : "bg-accent text-paper"
        }`}
      >
        {n}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-bold text-ink">{step.label}</span>
        {step.tool && <code className="text-xs text-muted">{step.tool}</code>}
        {step.status === "running" && <span className="text-sm text-accent">working…</span>}
      </div>
      {step.summary && <p className="text-sm text-muted">{step.summary}</p>}
      {hasDetail && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-bold text-accent" aria-expanded={open}>
          {open ? "Hide API details" : step.qloo?.length ? `Show the Qloo call${step.qloo.length > 1 ? "s" : ""}` : "Show input"}
        </button>
      )}
      {open && (
        <>
          {step.qloo?.map((c, i) => <QlooCall key={i} call={c} />)}
          {!step.qloo?.length && step.input != null && (
            <pre className="mt-2 overflow-x-auto rounded-md border border-rule bg-paper p-3 text-xs">{JSON.stringify(step.input, null, 2)}</pre>
          )}
        </>
      )}
    </li>
  );
}

export function TraceTimeline({ steps, live = false }: { steps: AgentStep[]; live?: boolean }) {
  let n = 0;
  return (
    <ol className="relative">
      <span className="absolute bottom-3 left-3 top-3 w-px bg-rule" aria-hidden />
      {steps.map((s) => (
        <Step key={s.id} step={s} n={s.kind === "thought" ? 0 : ++n} live={live} />
      ))}
    </ol>
  );
}

export function TracePanel({ steps, qlooCalls }: { steps: AgentStep[]; qlooCalls: number }) {
  return (
    <details className="group rounded-lg border border-rule bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <span>
          <span className="font-display text-xl">How Encore thought</span>
          <span className="ml-2 text-sm text-muted">
            {steps.filter((s) => s.kind !== "thought").length} steps, {qlooCalls} Qloo API calls
          </span>
        </span>
        <span className="text-sm font-bold text-accent group-open:hidden">Show</span>
        <span className="hidden text-sm font-bold text-accent group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-rule px-5 py-4">
        <TraceTimeline steps={steps} />
      </div>
    </details>
  );
}

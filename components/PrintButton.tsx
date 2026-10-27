"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full border border-ink/30 px-6 py-3 font-bold hover:border-ink/60 print:hidden">
      Print or save as PDF
    </button>
  );
}

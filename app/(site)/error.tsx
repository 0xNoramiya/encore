"use client";

import Link from "next/link";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-24 sm:px-8">
      <h1 className="font-display text-5xl leading-tight">Encore couldn’t load this</h1>
      <p className="text-lg text-muted">The connection to the database or the taste graph dropped for a moment. Nothing you saved is lost.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-accent px-7 py-3.5 text-lg font-bold text-paper">
          Try again
        </button>
        <Link href="/" className="rounded-full border border-ink/30 px-7 py-3.5 text-lg font-bold">
          Go to the start
        </Link>
      </div>
    </main>
  );
}

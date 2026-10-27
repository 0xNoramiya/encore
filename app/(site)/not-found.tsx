import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-5 py-24 sm:px-8">
      <h1 className="font-display text-5xl leading-tight">This page isn’t here</h1>
      <p className="text-lg text-muted">
        Profiles and sessions belong to the browser that made them, so a link from someone else won’t open here. You can start fresh or try an example.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/intake" className="rounded-full bg-accent px-7 py-3.5 text-lg font-bold text-paper">
          Start for someone you love
        </Link>
        <Link href="/" className="rounded-full border border-ink/30 px-7 py-3.5 text-lg font-bold">
          See the examples
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 print:hidden">
        <Link href="/" className="font-display text-2xl tracking-tight text-ink">
          Encore
        </Link>
        <Link href="/intake" className="hidden rounded-full border border-ink/20 px-4 py-2 text-sm font-bold hover:border-ink/50 sm:block">
          Start for someone you love
        </Link>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="mx-auto w-full max-w-6xl px-5 pb-10 pt-16 text-sm text-muted sm:px-8 print:pt-8">
        Encore is a comfort and connection tool, not a medical device or treatment. Recommendations powered by Qloo.
      </footer>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible, Young_Serif } from "next/font/google";
import "./globals.css";

// Young Serif: sturdy vintage book-jacket serif for titles. Atkinson
// Hyperlegible: designed for low-vision readers, for everything else.
const display = Young_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const ui = Atkinson_Hyperlegible({ variable: "--font-ui", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "Encore", template: "%s · Encore" },
  description: "When someone can no longer tell you what they love, their taste graph still can.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="font-display text-2xl tracking-tight text-ink">
            Encore
          </Link>
          <Link href="/intake" className="hidden rounded-full border border-ink/20 px-4 py-2 text-sm font-bold hover:border-ink/50 sm:block">
            Start for someone you love
          </Link>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="mx-auto w-full max-w-6xl px-5 pb-10 pt-16 text-sm text-muted sm:px-8">
          Encore is a comfort and connection tool, not a medical device or treatment. Recommendations powered by Qloo.
        </footer>
      </body>
    </html>
  );
}

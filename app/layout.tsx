import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Fraunces } from "next/font/google";
import "./globals.css";

// Fraunces for display titles (album sleeve / theater program feel); Atkinson
// Hyperlegible for UI, designed for low-vision readers.
const display = Fraunces({ variable: "--font-display", subsets: ["latin"] });
const sans = Atkinson_Hyperlegible({ variable: "--font-ui", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Encore",
  description: "When someone can no longer tell you what they love, their taste graph still can.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

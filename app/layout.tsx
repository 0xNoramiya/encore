import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = { themeColor: "#f5efe4" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

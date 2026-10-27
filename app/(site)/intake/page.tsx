import type { Metadata } from "next";
import { IntakeForm } from "@/components/IntakeForm";

export const metadata: Metadata = { title: "Start for someone you love" };

export default function IntakePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-10 pt-6 sm:px-8">
      <h1 className="font-display text-5xl leading-tight">Start for someone you love</h1>
      <p className="mb-14 mt-4 max-w-[60ch] text-lg text-muted">
        A few memories are enough. Encore builds outward from them through Qloo’s taste graph, scoped to the years and the place they grew up in.
      </p>
      <IntakeForm />
    </main>
  );
}

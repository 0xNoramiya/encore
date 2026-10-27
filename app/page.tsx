export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-bold uppercase tracking-widest text-accent">Encore</p>
      <h1 className="font-display text-5xl leading-tight text-balance">
        When someone can no longer tell you what they love, their taste graph still can.
      </h1>
      <p className="text-lg text-muted">
        A taste-memory companion for dementia caregivers, powered by Qloo. Coming together now.
      </p>
      <p className="border-t border-line pt-6 text-sm text-muted">
        Encore is a comfort and connection tool, not a medical device or treatment.
      </p>
    </main>
  );
}

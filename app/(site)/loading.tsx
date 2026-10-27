export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="h-14 w-2/3 max-w-xl animate-pulse rounded-md bg-rule/70 motion-reduce:animate-none" />
      <div className="mt-5 h-5 w-1/2 max-w-md animate-pulse rounded bg-rule/60 motion-reduce:animate-none" />
      <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-md bg-rule/60 motion-reduce:animate-none" />
        ))}
      </div>
    </main>
  );
}

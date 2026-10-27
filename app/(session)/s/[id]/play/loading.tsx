export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper" aria-busy="true">
      <p className="font-display text-4xl text-muted">Getting the session ready…</p>
    </div>
  );
}

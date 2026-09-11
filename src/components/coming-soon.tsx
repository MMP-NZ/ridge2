export function ComingSoon({ title, milestone }: { title: string; milestone: string }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
        <p>Coming in {milestone}.</p>
      </div>
    </main>
  );
}

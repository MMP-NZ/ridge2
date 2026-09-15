import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { listPriceBook } from "@/lib/price-book/items";
import { formatNzd } from "@/lib/money";
import { AddItemForm, PriceField } from "./price-book-forms";
import { retireItemAction, restoreItemAction, seedPriceBookAction } from "./actions";

const KIND_LABELS: Record<string, string> = {
  per_m2: "per m²",
  per_metre: "per metre",
  fixed: "fixed price",
};

export default async function PriceBookPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const items = await withRooferAccess(session.tenantId, (tx) => listPriceBook(tx, session.tenantId, true));
  const active = items.filter((item) => item.active);
  const retired = items.filter((item) => !item.active);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Price book</h1>
      <p className="text-sm text-muted">
        Your rates, excluding GST. Quotes are built from these — changing a rate here never changes a quote you&apos;ve
        already sent.
      </p>

      {items.length === 0 ? (
        <section className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm">Your price book is empty.</p>
          <form action={seedPriceBookAction} className="mt-3">
            <button type="submit" className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white">
              Start with the standard list
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Roof painting, prep, re-roofing, repairs, leak repairs, spouting and moss treatment — edit every rate to
            your own pricing.
          </p>
        </section>
      ) : null}

      {active.length > 0 ? (
        <section className="flex flex-col gap-2">
          {active.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted">
                    {formatNzd(item.unitPriceCents)} {KIND_LABELS[item.kind]}
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                </div>
                <form action={retireItemAction}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm">
                    Retire
                  </button>
                </form>
              </div>
              <PriceField itemId={item.id} unitPriceCents={item.unitPriceCents} />
            </article>
          ))}
        </section>
      ) : null}

      <AddItemForm />

      {retired.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">Retired</h2>
          {retired.map((item) => (
            <article key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <p className="min-w-0 text-sm text-muted">
                {item.name} · {formatNzd(item.unitPriceCents)} {KIND_LABELS[item.kind]}
              </p>
              <form action={restoreItemAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm">
                  Restore
                </button>
              </form>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}

import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { listPriceBook } from "@/lib/price-book/items";
import { formatNzd } from "@/lib/money";
import { PriceBookIcon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Screen,
  SectionHeading,
} from "@/components/ui";
import { AddItemForm, PriceField } from "./price-book-forms";
import {
  retireItemAction,
  restoreItemAction,
  seedPriceBookAction,
} from "./actions";

const KIND_LABELS: Record<string, string> = {
  per_m2: "per m²",
  per_metre: "per metre",
  fixed: "fixed price",
};

export default async function PriceBookPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const items = await withRooferAccess(session.tenantId, (tx) =>
    listPriceBook(tx, session.tenantId, true),
  );
  const active = items.filter((item) => item.active);
  const retired = items.filter((item) => !item.active);

  return (
    <Screen>
      <PageHeader
        backHref="/more"
        backLabel="More"
        title="Price book"
        description="Your rates, excluding GST. Quotes are built from these — changing a rate here never changes a quote you've already sent."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<PriceBookIcon className="h-6 w-6" />}
          title="Your price book is empty"
          description="Start from the standard roofing list — painting, prep, re-roofing, repairs, leak repairs, spouting and moss treatment — then edit every rate to your own pricing."
          action={
            <form action={seedPriceBookAction}>
              <Button type="submit" block>
                Start with the standard list
              </Button>
            </form>
          }
        />
      ) : null}

      {active.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>
            {active.length} {active.length === 1 ? "rate" : "rates"}
          </SectionHeading>

          {active.map((item) => (
            <Card key={item.id} as="article" className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-title font-semibold tracking-[-0.01em]">
                    {item.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-muted">
                    <span>Charged {KIND_LABELS[item.kind]}</span>
                    {item.category ? (
                      <Badge tone="neutral">{item.category}</Badge>
                    ) : null}
                  </p>
                </div>
                <form action={retireItemAction} className="shrink-0">
                  <input type="hidden" name="itemId" value={item.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Retire
                  </Button>
                </form>
              </div>
              <PriceField
                itemId={item.id}
                unitPriceCents={item.unitPriceCents}
              />
            </Card>
          ))}
        </section>
      ) : null}

      <AddItemForm />

      {retired.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeading>Retired</SectionHeading>
          {retired.map((item) => (
            <Card
              key={item.id}
              as="article"
              tone="quiet"
              padding="sm"
              className="flex items-center gap-3"
            >
              <p className="min-w-0 flex-1 text-caption text-muted">
                {item.name} · {formatNzd(item.unitPriceCents)}{" "}
                {KIND_LABELS[item.kind]}
              </p>
              <form action={restoreItemAction} className="shrink-0">
                <input type="hidden" name="itemId" value={item.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Restore
                </Button>
              </form>
            </Card>
          ))}
        </section>
      ) : null}
    </Screen>
  );
}

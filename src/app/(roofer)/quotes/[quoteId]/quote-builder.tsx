"use client";

import { useActionState, useMemo, useState } from "react";
import { PlusIcon } from "@/components/icons";
import {
  Button,
  Card,
  CardTitle,
  Field,
  FormMessage,
  SectionHeading,
  SelectInput,
  TextInput,
} from "@/components/ui";
import { formatNzd } from "@/lib/money";
import { calculateQuoteTotals } from "@/lib/quotes/totals";
import { formatQuantity, parsePriceToCents, parseQuantityToThousandths } from "@/lib/quotes/parse";
import type { PriceBookKind } from "@/db/schema";
import { saveQuoteLinesAction, sendQuoteAction, type QuoteEditorState } from "../actions";

const initialState: QuoteEditorState = {};

const KIND_LABELS: Record<PriceBookKind, string> = {
  per_m2: "per m²",
  per_metre: "per metre",
  fixed: "fixed price",
};

export interface BuilderLine {
  description: string;
  kind: PriceBookKind;
  quantityThousandths: number;
  unitPriceCents: number;
  priceBookItemId: string | null;
}

export interface PriceBookOption {
  id: string;
  name: string;
  kind: PriceBookKind;
  unitPriceCents: number;
  unit: string | null;
}

/** Lines are held as the strings the roofer typed, so a half-typed "12." doesn't jump around under him. */
interface EditableLine {
  key: string;
  description: string;
  kind: PriceBookKind;
  quantity: string;
  price: string;
  priceBookItemId: string;
}

function toEditable(line: BuilderLine): EditableLine {
  return {
    key: crypto.randomUUID(),
    description: line.description,
    kind: line.kind,
    quantity: formatQuantity(line.quantityThousandths),
    price: (line.unitPriceCents / 100).toFixed(2),
    priceBookItemId: line.priceBookItemId ?? "",
  };
}

export function QuoteBuilder({
  quoteId,
  lines: initialLines,
  priceBook,
  gstRateBp,
  estimatedDays,
}: {
  quoteId: string;
  lines: BuilderLine[];
  priceBook: PriceBookOption[];
  gstRateBp: number;
  estimatedDays: number;
}) {
  const [lines, setLines] = useState<EditableLine[]>(() => initialLines.map(toEditable));
  const [saveState, saveAction, saving] = useActionState(saveQuoteLinesAction, initialState);
  const [sendState, sendAction, sending] = useActionState(sendQuoteAction, initialState);

  /**
   * Recomputed as he types, from the same pure function the server uses to
   * store the figures — so the number on screen is the number that gets
   * saved, not an approximation of it.
   */
  const totals = useMemo(() => {
    const priced = lines
      .map((line) => ({
        quantityThousandths: parseQuantityToThousandths(line.quantity || "1") ?? 0,
        unitPriceCents: parsePriceToCents(line.price) ?? 0,
      }))
      .filter((_, i) => lines[i].description.trim() !== "");
    return calculateQuoteTotals(priced, gstRateBp);
  }, [lines, gstRateBp]);

  function addFromPriceBook(item: PriceBookOption) {
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        description: item.name,
        kind: item.kind,
        quantity: item.kind === "fixed" ? "1" : "",
        price: (item.unitPriceCents / 100).toFixed(2),
        priceBookItemId: item.id,
      },
    ]);
  }

  function addBlankLine() {
    setLines((current) => [
      ...current,
      { key: crypto.randomUUID(), description: "", kind: "fixed", quantity: "1", price: "", priceBookItemId: "" },
    ]);
  }

  function update(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function remove(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  const hasLines = lines.some((line) => line.description.trim() !== "");
  const error = saveState.error ?? sendState.error;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <SectionHeading>From your price book</SectionHeading>
        {priceBook.length === 0 ? (
          <Card tone="quiet">
            <p className="text-caption text-muted">
              Your price book is empty. Add your rates in More → Price book and they&apos;ll be one tap away here.
            </p>
          </Card>
        ) : (
          <div className="flex flex-wrap gap-2">
            {priceBook.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addFromPriceBook(item)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-border-strong bg-surface px-3.5 text-caption font-semibold transition-colors hover:bg-surface-sunken active:bg-surface-sunken"
              >
                <PlusIcon className="h-4 w-4 text-accent" />
                {item.name}
                <span className="font-normal text-muted">{formatNzd(item.unitPriceCents)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="quoteId" value={quoteId} />

        {lines.length === 0 ? (
          <Card tone="quiet">
            <p className="text-center text-caption text-muted">
              Tap a price book item above to start the quote.
            </p>
          </Card>
        ) : null}

        {lines.map((line, index) => {
          const quantityThousandths = parseQuantityToThousandths(line.quantity || "1");
          const unitPriceCents = parsePriceToCents(line.price);
          const lineTotal =
            quantityThousandths !== null && unitPriceCents !== null
              ? Math.round((unitPriceCents * quantityThousandths) / 1000)
              : null;

          return (
            <Card key={line.key} className="flex flex-col gap-3">
              <input type="hidden" name="linePriceBookItemId" value={line.priceBookItemId} />

              <Field label={`Line ${index + 1}`} htmlFor={`desc-${line.key}`}>
                <TextInput
                  id={`desc-${line.key}`}
                  name="lineDescription"
                  value={line.description}
                  onChange={(e) => update(line.key, { description: e.target.value })}
                  placeholder="What the work is"
                />
              </Field>

              <div className="flex gap-3">
                <Field label="Charged" htmlFor={`kind-${line.key}`} className="flex-1">
                  <SelectInput
                    id={`kind-${line.key}`}
                    name="lineKind"
                    value={line.kind}
                    onChange={(e) => update(line.key, { kind: e.target.value as PriceBookKind })}
                  >
                    {(Object.keys(KIND_LABELS) as PriceBookKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field
                  label="Qty"
                  hint={line.kind === "per_m2" ? "m²" : line.kind === "per_metre" ? "m" : undefined}
                  htmlFor={`qty-${line.key}`}
                  className="w-24 shrink-0"
                >
                  <TextInput
                    id={`qty-${line.key}`}
                    name="lineQuantity"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                    placeholder="12.5"
                  />
                </Field>
                <Field label="Rate" hint="ex GST" htmlFor={`price-${line.key}`} className="w-28 shrink-0">
                  <TextInput
                    id={`price-${line.key}`}
                    name="linePrice"
                    inputMode="decimal"
                    value={line.price}
                    onChange={(e) => update(line.key, { price: e.target.value })}
                    placeholder="48.50"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-title font-semibold tabular-nums">
                  {lineTotal === null ? "—" : formatNzd(lineTotal)}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(line.key)}>
                  Remove
                </Button>
              </div>
            </Card>
          );
        })}

        <Button type="button" variant="secondary" block onClick={addBlankLine} icon={<PlusIcon className="h-4 w-4" />}>
          Add a line
        </Button>

        <Card className="flex flex-col gap-2">
          <Field
            label="How many days on site"
            htmlFor="estimatedDays"
            help="Used to book the work into your diary if they accept. You can change it later."
          >
            <TextInput
              id="estimatedDays"
              name="estimatedDays"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={estimatedDays}
            />
          </Field>
        </Card>

        <Card tone="raised" className="flex flex-col gap-2">
          <CardTitle>Total</CardTitle>
          <dl className="flex flex-col gap-1.5 text-body">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal (ex GST)</dt>
              <dd className="tabular-nums">{formatNzd(totals.subtotalExGstCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">GST</dt>
              <dd className="tabular-nums">{formatNzd(totals.gstCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 text-title font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatNzd(totals.totalIncGstCents)}</dd>
            </div>
          </dl>
        </Card>

        {error ? <FormMessage>{error}</FormMessage> : null}
        {saveState.savedAt && !error ? <FormMessage tone="success">Saved.</FormMessage> : null}

        <Button type="submit" variant="secondary" block pending={saving} pendingLabel="Saving…">
          Save draft
        </Button>
      </form>

      <form action={sendAction}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <Button type="submit" size="lg" block pending={sending} pendingLabel="Sending…" disabled={!hasLines}>
          Send to the customer
        </Button>
        <p className="mt-2 text-center text-caption text-muted">
          Save your changes first — sending uses what&apos;s saved.
        </p>
      </form>
    </div>
  );
}

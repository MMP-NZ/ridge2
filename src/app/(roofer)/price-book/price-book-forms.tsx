"use client";

import { useActionState } from "react";
import { addPriceBookItemAction, updatePriceAction, type PriceBookState } from "./actions";

const initialState: PriceBookState = {};

/** Inline rate editor on each item — the one thing a roofer changes often. */
export function PriceField({ itemId, unitPriceCents }: { itemId: string; unitPriceCents: number }) {
  const [state, formAction, pending] = useActionState(updatePriceAction, initialState);

  return (
    <form action={formAction} className="mt-3 flex items-end gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={`price-${itemId}`} className="text-xs text-muted">
          Rate excluding GST
        </label>
        <input
          id={`price-${itemId}`}
          name="price"
          inputMode="decimal"
          defaultValue={(unitPriceCents / 100).toFixed(2)}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error ? <p className="w-full text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}

export function AddItemForm() {
  const [state, formAction, pending] = useActionState(addPriceBookItemAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">Add an item</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Ridge capping replacement"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="kind" className="text-sm font-medium">
            Charged
          </label>
          <select id="kind" name="kind" className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base">
            <option value="per_m2">per m²</option>
            <option value="per_metre">per metre</option>
            <option value="fixed">fixed price</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="price" className="text-sm font-medium">
            Rate (ex GST)
          </label>
          <input
            id="price"
            name="price"
            inputMode="decimal"
            required
            placeholder="48.50"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="unit" className="text-sm font-medium">
            Unit label
          </label>
          <input
            id="unit"
            name="unit"
            placeholder="m²"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="category" className="text-sm font-medium">
            Category
          </label>
          <input
            id="category"
            name="category"
            placeholder="Repairs"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </div>
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add item"}
      </button>
    </form>
  );
}

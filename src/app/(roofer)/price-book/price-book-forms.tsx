"use client";

import { useActionState } from "react";
import {
  Button,
  Card,
  CardTitle,
  Field,
  FormMessage,
  SelectInput,
  TextInput,
} from "@/components/ui";
import {
  addPriceBookItemAction,
  updatePriceAction,
  type PriceBookState,
} from "./actions";

const initialState: PriceBookState = {};

/** Inline rate editor on each item — the one thing a roofer changes often. */
export function PriceField({
  itemId,
  unitPriceCents,
}: {
  itemId: string;
  unitPriceCents: number;
}) {
  const [state, formAction, pending] = useActionState(
    updatePriceAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 border-t border-border pt-3"
    >
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex items-end gap-2">
        <Field
          label="Rate ex GST"
          htmlFor={`price-${itemId}`}
          className="flex-1"
        >
          <TextInput
            id={`price-${itemId}`}
            name="price"
            inputMode="decimal"
            defaultValue={(unitPriceCents / 100).toFixed(2)}
            aria-invalid={state.error ? true : undefined}
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          pending={pending}
          pendingLabel="Saving…"
        >
          Save
        </Button>
      </div>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}

export function AddItemForm() {
  const [state, formAction, pending] = useActionState(
    addPriceBookItemAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <Card className="flex flex-col gap-4">
        <CardTitle>Add an item</CardTitle>

        <Field label="Name" htmlFor="name">
          <TextInput
            id="name"
            name="name"
            required
            placeholder="Flashing replacement"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Charged" htmlFor="kind" className="flex-1">
            <SelectInput id="kind" name="kind">
              <option value="per_m2">per m²</option>
              <option value="per_metre">per metre</option>
              <option value="fixed">fixed price</option>
            </SelectInput>
          </Field>
          <Field label="Rate" hint="ex GST" htmlFor="price" className="flex-1">
            <TextInput
              id="price"
              name="price"
              inputMode="decimal"
              required
              placeholder="48.50"
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Unit label" htmlFor="unit" className="flex-1">
            <TextInput id="unit" name="unit" placeholder="m²" />
          </Field>
          <Field label="Category" htmlFor="category" className="flex-1">
            <TextInput id="category" name="category" placeholder="Repairs" />
          </Field>
        </div>

        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        <Button type="submit" block pending={pending} pendingLabel="Adding…">
          Add item
        </Button>
      </Card>
    </form>
  );
}

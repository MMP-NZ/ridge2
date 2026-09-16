"use client";

import { useActionState } from "react";
import { Button, FormMessage } from "@/components/ui";
import { runBillingAction, type BillingRunState } from "./actions";

const initialState: BillingRunState = {};

export function RunBillingForm({ month, billableCount }: { month: string; billableCount: number }) {
  const [state, formAction, pending] = useActionState(runBillingAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="month" value={month} />

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.raised !== undefined && !state.error ? (
        <FormMessage tone="success">
          {state.raised} {state.raised === 1 ? "invoice" : "invoices"} raised
          {state.skippedAlreadyBilled ? `, ${state.skippedAlreadyBilled} already billed` : ""}
          {state.skippedNothingOwing ? `, ${state.skippedNothingOwing} owing nothing` : ""}.
        </FormMessage>
      ) : null}

      <Button type="submit" size="lg" block pending={pending} pendingLabel="Raising…" disabled={billableCount === 0}>
        {billableCount === 0
          ? "Nothing to bill"
          : `Raise ${billableCount} ${billableCount === 1 ? "invoice" : "invoices"}`}
      </Button>
      <p className="text-center text-caption text-muted">
        Check the figures above first — this is what each roofer will be charged.
      </p>
    </form>
  );
}

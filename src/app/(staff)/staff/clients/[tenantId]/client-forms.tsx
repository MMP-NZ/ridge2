"use client";

import { useActionState } from "react";
import { Button, Card, CardTitle, Field, FormMessage, TextInput } from "@/components/ui";
import { recordTopUpAction, logMaxHoursAction, type ClientActionState } from "./actions";

const initialState: ClientActionState = {};

export function TopUpForm({ tenantId }: { tenantId: string }) {
  const [state, formAction, pending] = useActionState(recordTopUpAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <Card className="flex flex-col gap-3">
        <CardTitle>Record an ad top-up</CardTitle>
        <p className="text-caption text-muted">
          Money he&apos;s prepaid for ads. Passed on at cost — it appears on his invoice as its own line.
        </p>
        <div className="flex gap-3">
          <Field label="Amount" hint="$" htmlFor="amount" className="flex-1">
            <TextInput id="amount" name="amount" inputMode="decimal" required placeholder="500.00" />
          </Field>
          <Field label="Note" hint="optional" htmlFor="note" className="flex-1">
            <TextInput id="note" name="note" placeholder="October" />
          </Field>
        </div>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        {state.savedAt && !state.error ? <FormMessage tone="success">Top-up recorded.</FormMessage> : null}
        <Button type="submit" block pending={pending} pendingLabel="Recording…">
          Record top-up
        </Button>
      </Card>
    </form>
  );
}

export function MaxHoursForm({ tenantId }: { tenantId: string }) {
  const [state, formAction, pending] = useActionState(logMaxHoursAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <Card className="flex flex-col gap-3">
        <CardTitle>Log time</CardTitle>
        <p className="text-caption text-muted">
          Internal only — never shown to the client. MAX includes four hours a month.
        </p>
        <div className="flex gap-3">
          <Field label="Hours" htmlFor="hours" className="w-28 shrink-0">
            <TextInput id="hours" name="hours" inputMode="decimal" required placeholder="1.5" />
          </Field>
          <Field label="What on" hint="optional" htmlFor="maxNote" className="flex-1">
            <TextInput id="maxNote" name="note" placeholder="Chasing quotes" />
          </Field>
        </div>
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        {state.savedAt && !state.error ? <FormMessage tone="success">Logged.</FormMessage> : null}
        <Button type="submit" variant="secondary" block pending={pending} pendingLabel="Saving…">
          Log time
        </Button>
      </Card>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import {
  Button,
  Card,
  Field,
  FormMessage,
  SelectInput,
  TextInput,
} from "@/components/ui";
import { addLeadAction, type AddLeadState } from "../actions";

const initialState: AddLeadState = {};

export function AddLeadForm() {
  const [state, formAction, pending] = useActionState(
    addLeadAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <Field label="Name" htmlFor="name">
          <TextInput
            id="name"
            name="name"
            required
            autoComplete="name"
            placeholder="Sarah Whitfield"
          />
        </Field>

        <Field label="Phone" htmlFor="phone">
          <TextInput
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="021 555 0134"
          />
        </Field>

        <Field
          label="Email"
          htmlFor="email"
          help="Enter a phone or an email (or both)."
        >
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="sarah@example.co.nz"
          />
        </Field>

        <Field label="Property address" htmlFor="address">
          <TextInput
            id="address"
            name="address"
            required
            placeholder="14 Kowhai Street, Papanui"
          />
        </Field>

        <Field label="Where did this come from?" htmlFor="source">
          <SelectInput id="source" name="source" defaultValue="roofer_own">
            <option value="roofer_own">
              My own (word of mouth, repeat customer)
            </option>
            <option value="juno_referral">A referral</option>
          </SelectInput>
        </Field>
      </Card>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button
        type="submit"
        size="lg"
        block
        pending={pending}
        pendingLabel="Adding…"
      >
        Add lead
      </Button>
    </form>
  );
}

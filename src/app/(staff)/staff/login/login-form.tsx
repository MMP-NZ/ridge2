"use client";

import { useActionState } from "react";
import { Button, Card, Field, FormMessage, TextInput } from "@/components/ui";
import { staffLoginAction, type StaffLoginState } from "./actions";

const initialState: StaffLoginState = {};

export function StaffLoginForm() {
  const [state, formAction, pending] = useActionState(staffLoginAction, initialState);

  return (
    <form action={formAction}>
      <Card className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <TextInput id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <TextInput id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="Authenticator code" hint="if set up" htmlFor="totpCode">
          <TextInput id="totpCode" name="totpCode" inputMode="numeric" autoComplete="one-time-code" />
        </Field>

        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        <Button type="submit" size="lg" block pending={pending} pendingLabel="Signing in…">
          Sign in
        </Button>
      </Card>
    </form>
  );
}

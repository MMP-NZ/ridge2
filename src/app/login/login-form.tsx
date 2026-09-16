"use client";

import { useActionState } from "react";
import { Button, Card, Field, FormMessage, TextInput } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card tone="raised" padding="lg" className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <TextInput
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={state.error ? true : undefined}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <TextInput
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={state.error ? true : undefined}
          />
        </Field>

        <Field
          label="Authenticator code"
          hint="(only if you've set one up)"
          htmlFor="totpCode"
        >
          <TextInput
            id="totpCode"
            name="totpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
          />
        </Field>

        {state.error ? <FormMessage>{state.error}</FormMessage> : null}

        <Button
          type="submit"
          size="lg"
          block
          pending={pending}
          pendingLabel="Signing in…"
        >
          Sign in
        </Button>
      </Card>
    </form>
  );
}

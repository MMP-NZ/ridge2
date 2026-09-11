"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="totpCode" className="text-sm font-medium">
          Authenticator code <span className="font-normal text-muted">(only if you've set one up)</span>
        </label>
        <input
          id="totpCode"
          name="totpCode"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-accent px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

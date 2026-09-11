"use client";

import { useActionState } from "react";
import { addLeadAction, type AddLeadState } from "../actions";

const initialState: AddLeadState = {};

export function AddLeadForm() {
  const [state, formAction, pending] = useActionState(addLeadAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input id="name" name="name" required className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="phone" className="text-sm font-medium">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      <p className="-mt-2 text-xs text-muted">Enter a phone or an email (or both).</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="address" className="text-sm font-medium">
          Property address
        </label>
        <input
          id="address"
          name="address"
          required
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="source" className="text-sm font-medium">
          Where did this come from?
        </label>
        <select id="source" name="source" defaultValue="roofer_own" className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base">
          <option value="roofer_own">My own (word of mouth, repeat customer)</option>
          <option value="juno_referral">A referral</option>
        </select>
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
        {pending ? "Adding…" : "Add lead"}
      </button>
    </form>
  );
}

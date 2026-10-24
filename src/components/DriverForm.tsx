"use client";

import { useActionState } from "react";
import { saveDriverAction } from "../app/actions";
import { centsToDollarInput } from "../lib/money";
import type { ClaimType, DriverFee } from "../lib/types";

export function DriverForm({
  driver,
  claimTypes,
  typeFees,
}: {
  driver?: { id: number; name: string; email: string; defaultFeeCents: number };
  claimTypes: ClaimType[];
  typeFees: DriverFee[];
}) {
  const [state, action, pending] = useActionState(saveDriverAction, { error: null });
  const fees = new Map(typeFees.map((fee) => [fee.claimTypeId, fee.amountCents]));

  return (
    <form action={action} className="stack">
      {driver ? <input type="hidden" name="id" value={driver.id} /> : null}
      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="form-grid">
        <label className="field">
          Name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={driver?.name ?? ""}
            autoComplete="name"
          />
        </label>
        <label className="field">
          Email
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            defaultValue={driver?.email ?? ""}
            autoComplete="email"
          />
        </label>
        <label className="field">
          Default contract fee (USD)
          <input
            name="defaultFee"
            inputMode="decimal"
            required
            defaultValue={driver ? centsToDollarInput(driver.defaultFeeCents) : ""}
            placeholder="25.00"
          />
          <small>Used when a person applies a fee. Nothing is charged automatically.</small>
        </label>
      </div>
      <fieldset className="fee-fields">
        <legend>Fee for a specific claim type</legend>
        <p className="hint">Leave a type blank to use the default fee.</p>
        {claimTypes.map((type) => {
          const amount = fees.get(type.id);
          return (
            <label className="field" key={type.id}>
              {type.label}
              <input
                name={`typeFee_${type.id}`}
                inputMode="decimal"
                placeholder="Use default"
                defaultValue={amount === undefined ? "" : centsToDollarInput(amount)}
              />
            </label>
          );
        })}
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Saving…" : driver ? "Save driver" : "Add driver"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { createClaimAction } from "../app/actions";
import type { ClaimType } from "../lib/types";

export function ClaimForm({
  drivers,
  claimTypes,
  defaultOccurredAt,
}: {
  drivers: { id: number; name: string; email: string }[];
  claimTypes: ClaimType[];
  defaultOccurredAt: string;
}) {
  const [state, action, pending] = useActionState(createClaimAction, { error: null });

  return (
    <form action={action} className="stack">
      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <label className="field">
        Driver
        <select name="driverId" required defaultValue="">
          <option value="" disabled>
            Choose a driver
          </option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name} — {driver.email}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="choices">
        <legend>What was not done</legend>
        {claimTypes.map((type) => (
          <label className="choice" key={type.id}>
            <input type="radio" name="claimTypeId" value={type.id} required />
            <span>
              <strong>{type.label}</strong>
              <small>{type.description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="form-grid">
        <label className="field">
          Order reference
          <input name="orderReference" maxLength={80} placeholder="Optional" />
        </label>
        <label className="field">
          When it happened
          <input type="date" name="occurredAt" required defaultValue={defaultOccurredAt} />
        </label>
      </div>
      <label className="field">
        What went wrong
        <textarea
          name="notes"
          required
          maxLength={2000}
          rows={5}
          placeholder="What the driver did, and what should have happened."
        />
      </label>
      <p className="hint">
        Source is manual. Saving this record does not email the driver. Xcelerator import is not
        connected.
      </p>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Saving…" : "Record claim"}
        </button>
      </div>
    </form>
  );
}

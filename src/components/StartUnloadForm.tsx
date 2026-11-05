"use client";

import { useActionState } from "react";
import { startUnloadAction } from "../app/actions";
import { SubmitButton } from "./SubmitButton";
import { useFields } from "./useFields";

export function StartUnloadForm({
  loadId,
  defaultStartedAt,
}: {
  loadId: number;
  defaultStartedAt: string;
}) {
  const [state, action] = useActionState(startUnloadAction, { error: null });
  const { bind } = useFields({
    unloadedBy: "",
    startedAt: defaultStartedAt,
  });

  return (
    <form action={action} className="stack-tight" onReset={(event) => event.preventDefault()}>
      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="loadId" value={loadId} />
      <label className="field">
        Who unloaded it
        <input required maxLength={120} {...bind("unloadedBy")} />
      </label>
      <label className="field">
        Unload started
        <input type="datetime-local" required {...bind("startedAt")} />
      </label>
      <p className="hint">
        Starting moves this load from waiting to unloading. It is not done until you record the
        finish, the counts, the sort, and the putaway locations.
      </p>
      <SubmitButton className="button copper" pendingLabel="Starting…">
        Start unloading
      </SubmitButton>
    </form>
  );
}

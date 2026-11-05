"use client";

import { useActionState } from "react";
import { alterLoadAction } from "../app/actions";
import { SubmitButton } from "./SubmitButton";
import { useFields } from "./useFields";

type MoveAction = (
  previous: { error: string | null },
  formData: FormData,
) => Promise<{ error: string | null }>;

export function AdvanceStageForm({
  loadId,
  action,
  label,
  pendingLabel,
  hint,
}: {
  loadId: number;
  action: MoveAction;
  label: string;
  pendingLabel: string;
  hint: string;
}) {
  const [state, formAction] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="stack" onReset={(event) => event.preventDefault()}>
      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="loadId" value={loadId} />
      <p className="hint">{hint}</p>
      <div className="form-actions">
        <SubmitButton className="button primary" pendingLabel={pendingLabel}>
          {label}
        </SubmitButton>
      </div>
    </form>
  );
}

export function AlterDeliveryForm({ loadId }: { loadId: number }) {
  const [state, action] = useActionState(alterLoadAction, { error: null });
  const { bind } = useFields({ alterationNote: "" });

  return (
    <form action={action} className="stack" onReset={(event) => event.preventDefault()}>
      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="loadId" value={loadId} />
      <p className="hint">Altered means this delivery was changed after it was received.</p>
      <label className="field">
        What changed
        <textarea required maxLength={2000} rows={4} {...bind("alterationNote")} />
      </label>
      <div className="form-actions">
        <SubmitButton className="button primary" pendingLabel="Saving…">
          Mark altered
        </SubmitButton>
      </div>
    </form>
  );
}

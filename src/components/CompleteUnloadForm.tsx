"use client";

import { useActionState } from "react";
import { receiveLoadAction } from "../app/actions";
import {
  countPhrase,
  EXCEPTION_KINDS,
  EXCEPTION_LABELS,
  SORT_OUTCOMES,
  SORT_OUTCOME_DETAILS,
  SORT_OUTCOME_LABELS,
} from "../lib/load-types";
import { SubmitButton } from "./SubmitButton";
import { useFields } from "./useFields";

export function CompleteUnloadForm({
  loadId,
  expectedPallets,
  expectedPieces,
  defaultStartedAt,
  defaultFinishedAt,
}: {
  loadId: number;
  expectedPallets: number;
  expectedPieces: number;
  defaultStartedAt: string;
  defaultFinishedAt: string;
}) {
  const [state, action] = useActionState(receiveLoadAction, { error: null });
  const { bind, choose } = useFields({
    startedAt: defaultStartedAt,
    unloadedBy: "",
    finishedAt: defaultFinishedAt,
    receivedPallets: "",
    receivedPieces: "",
    sortOutcome: "",
    putawayLocations: "",
    damageQuantity: "",
    damageNotes: "",
    shortageQuantity: "",
    shortageNotes: "",
    overageQuantity: "",
    overageNotes: "",
  });

  return (
    <form action={action} className="stack" onReset={(event) => event.preventDefault()}>
      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="loadId" value={loadId} />
      <div className="compare" aria-label="Expected counts from receiving">
        <div>
          <span className="stat-label">Expected pallets</span>
          <strong>{countPhrase(expectedPallets, "pallet", "pallets")}</strong>
        </div>
        <div>
          <span className="stat-label">Expected pieces</span>
          <strong>{countPhrase(expectedPieces, "piece", "pieces")}</strong>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          Unload started
          <input type="datetime-local" required {...bind("startedAt")} />
        </label>
        <label className="field">
          Unloaded by
          <input required maxLength={120} {...bind("unloadedBy")} />
        </label>
        <label className="field">
          Unload finished
          <input type="datetime-local" required {...bind("finishedAt")} />
        </label>
        <label className="field">
          Pallets received
          <input type="number" required min={0} max={1000000} step={1} {...bind("receivedPallets")} />
          <small>Against {countPhrase(expectedPallets, "expected pallet", "expected pallets")}</small>
        </label>
        <label className="field">
          Pieces received
          <input type="number" required min={0} max={1000000} step={1} {...bind("receivedPieces")} />
          <small>Against {countPhrase(expectedPieces, "expected piece", "expected pieces")}</small>
        </label>
      </div>
      <fieldset className="choices">
        <legend>Sort outcome</legend>
        {SORT_OUTCOMES.map((outcome) => (
          <label className="choice" key={outcome}>
            <input type="radio" required {...choose("sortOutcome", outcome)} />
            <span>
              <strong>{SORT_OUTCOME_LABELS[outcome]}</strong>
              <small>{SORT_OUTCOME_DETAILS[outcome]}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        Putaway locations
        <textarea
          required
          maxLength={2000}
          rows={4}
          placeholder={"One location per line.\nIf the freight is held, name the hold location."}
          {...bind("putawayLocations")}
        />
      </label>
      <fieldset className="fee-fields">
        <legend>Exceptions</legend>
        <p className="hint">
          Record damage when you see it. Record a shortage or an overage when the received counts
          do not match receiving. Leave a block blank when it does not apply.
        </p>
        {EXCEPTION_KINDS.map((kind) => (
          <div className="exception-fields" key={kind}>
            <p className="exception-title">{EXCEPTION_LABELS[kind]}</p>
            <div className="form-grid">
              <label className="field">
                Quantity
                <input type="number" min={0} max={1000000} step={1} {...bind(`${kind}Quantity`)} />
              </label>
              <label className="field">
                What happened
                <input maxLength={500} {...bind(`${kind}Notes`)} />
              </label>
            </div>
          </div>
        ))}
      </fieldset>
      <div className="form-actions">
        <SubmitButton className="button good" pendingLabel="Saving…">
          Mark received
        </SubmitButton>
      </div>
    </form>
  );
}

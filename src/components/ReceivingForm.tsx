"use client";

import { useActionState } from "react";
import { createLoadAction } from "../app/actions";
import { SubmitButton } from "./SubmitButton";
import { useFields } from "./useFields";

export function ReceivingForm({ defaultArrivedAt }: { defaultArrivedAt: string }) {
  const [state, action] = useActionState(createLoadAction, { error: null });
  const { bind } = useFields({
    arrivedAt: defaultArrivedAt,
    carrier: "",
    trailerNumber: "",
    sealNumber: "",
    bolPro: "",
    references: "",
    dockDoor: "",
    driverName: "",
    expectedPallets: "",
    expectedPieces: "",
    notes: "",
  });

  return (
    <form action={action} className="stack" onReset={(event) => event.preventDefault()}>
      {state.error ? (
        <p className="banner bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <fieldset className="fee-fields">
        <legend>Trailer</legend>
        <label className="field">
          Arrival
          <input type="datetime-local" required {...bind("arrivedAt")} />
        </label>
        <div className="form-grid">
          <label className="field">
            Carrier
            <input required maxLength={120} {...bind("carrier")} />
          </label>
          <label className="field">
            Trailer number
            <input required maxLength={80} {...bind("trailerNumber")} />
          </label>
          <label className="field">
            Seal number
            <input required maxLength={80} {...bind("sealNumber")} />
          </label>
          <label className="field">
            BOL / PRO
            <input required maxLength={80} {...bind("bolPro")} />
          </label>
        </div>
        <label className="field">
          PO or ASN references
          <textarea required maxLength={2000} rows={3} placeholder="One per line" {...bind("references")} />
        </label>
        <div className="form-grid">
          <label className="field">
            Dock / door
            <input required maxLength={80} {...bind("dockDoor")} />
          </label>
          <label className="field">
            Driver name
            <input required maxLength={120} {...bind("driverName")} />
          </label>
          <label className="field">
            Expected pallets
            <input type="number" required min={0} max={1000000} step={1} {...bind("expectedPallets")} />
          </label>
          <label className="field">
            Expected pieces
            <input type="number" required min={0} max={1000000} step={1} {...bind("expectedPieces")} />
          </label>
        </div>
        <label className="field">
          Notes
          <textarea
            maxLength={2000}
            rows={4}
            placeholder="Seal condition, appointment, or anything the unload crew should know."
            {...bind("notes")}
          />
        </label>
      </fieldset>
      <p className="hint">
        Saving creates this delivery at New. It is on file and has not been confirmed yet.
      </p>
      <div className="form-actions">
        <SubmitButton className="button primary" pendingLabel="Saving…">
          Save as New
        </SubmitButton>
      </div>
    </form>
  );
}

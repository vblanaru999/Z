import Link from "next/link";
import { notFound } from "next/navigation";
import { arriveLoadAction, confirmLoadAction } from "../../../app/actions";
import { Banner } from "../../../components/Banner";
import { CompleteUnloadForm } from "../../../components/CompleteUnloadForm";
import { PageHeader } from "../../../components/PageHeader";
import { StageRail } from "../../../components/StageRail";
import { AdvanceStageForm, AlterDeliveryForm } from "../../../components/StageMoveForms";
import { ExceptionBadge, LoadStatusBadge } from "../../../components/StatusBadge";
import { firstParam, formatWhen, localDateTimeInputValue } from "../../../lib/format";
import {
  countPhrase,
  describeQuantityGap,
  SORT_OUTCOME_LABELS,
  STAGE_MEANINGS,
} from "../../../lib/load-types";
import { getLoad, inboundDataDir } from "../../../lib/loads";

export const dynamic = "force-dynamic";

function LocationList({ value }: { value: string }) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return <p className="notes">{value.trim()}</p>;
  return (
    <ul className="locations">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`}>{line}</li>
      ))}
    </ul>
  );
}

export default async function InboundLoadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
}) {
  const { id: rawId } = await params;
  const query = await searchParams;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const load = getLoad(inboundDataDir(), id);
  if (!load) notFound();

  const received =
    load.receivedPallets !== null && load.receivedPieces !== null
      ? describeQuantityGap(
          load.expectedPallets,
          load.expectedPieces,
          load.receivedPallets,
          load.receivedPieces,
        )
      : null;

  return (
    <>
      <PageHeader
        kicker={`Load ${load.id} · ${load.carrier}`}
        title={load.trailerNumber}
        lede={STAGE_MEANINGS[load.status]}
        action={
          <div className="form-actions">
            <LoadStatusBadge status={load.status} />
            <Link href="/" className="button quiet">
              All deliveries
            </Link>
          </div>
        }
      />
      <StageRail status={load.status} />
      <Banner error={firstParam(query.error)} notice={firstParam(query.notice)} />
      <div className="detail">
        <div className="panels">
          <section className="panel">
            <div className="section-head">
              <h2>Delivery record</h2>
              <LoadStatusBadge status={load.status} />
            </div>
            <dl className="facts">
              <div>
                <dt>Arrival</dt>
                <dd>{formatWhen(load.arrivedAt)}</dd>
              </div>
              <div>
                <dt>Carrier</dt>
                <dd>{load.carrier}</dd>
              </div>
              <div>
                <dt>Trailer</dt>
                <dd className="mono">{load.trailerNumber}</dd>
              </div>
              <div>
                <dt>Seal</dt>
                <dd className="mono">{load.sealNumber}</dd>
              </div>
              <div>
                <dt>BOL / PRO</dt>
                <dd className="mono">{load.bolPro}</dd>
              </div>
              <div>
                <dt>Dock / door</dt>
                <dd>{load.dockDoor}</dd>
              </div>
              <div>
                <dt>Driver</dt>
                <dd>{load.driverName}</dd>
              </div>
              <div>
                <dt>Expected</dt>
                <dd>
                  {countPhrase(load.expectedPallets, "pallet", "pallets")}
                  <div className="muted">{countPhrase(load.expectedPieces, "piece", "pieces")}</div>
                </dd>
              </div>
            </dl>
            <div className="stack" style={{ marginTop: 16 }}>
              <div>
                <p className="kicker">PO / ASN</p>
                <p className="notes">{load.references}</p>
              </div>
              <div>
                <p className="kicker">Notes</p>
                {load.receivingNotes ? (
                  <p className="notes">{load.receivingNotes}</p>
                ) : (
                  <p className="muted">No receiving notes.</p>
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Receipt</h2>
              {load.status === "received" || load.status === "altered" ? (
                <span className="muted">Recorded</span>
              ) : (
                <span className="muted">Not yet</span>
              )}
            </div>
            {load.status === "new" || load.status === "confirmed" ? (
              <p className="empty">
                Receipt is recorded after this delivery has Arrived. Nothing has been unloaded or
                put away.
              </p>
            ) : null}
            {load.unloadStartedAt && load.unloadedBy ? (
              <dl className="facts">
                <div>
                  <dt>Unload started</dt>
                  <dd>{formatWhen(load.unloadStartedAt)}</dd>
                </div>
                <div>
                  <dt>Unloaded by</dt>
                  <dd>{load.unloadedBy}</dd>
                </div>
                {load.unloadFinishedAt ? (
                  <div>
                    <dt>Unload finished</dt>
                    <dd>{formatWhen(load.unloadFinishedAt)}</dd>
                  </div>
                ) : null}
                {load.sortOutcome ? (
                  <div>
                    <dt>Sort</dt>
                    <dd>{SORT_OUTCOME_LABELS[load.sortOutcome]}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {(load.status === "received" || load.status === "altered") &&
            load.receivedPallets !== null &&
            load.receivedPieces !== null &&
            received ? (
              <div className="stack" style={{ marginTop: 16 }}>
                <div className="compare">
                  <div>
                    <span className="stat-label">Expected</span>
                    <strong>{countPhrase(load.expectedPallets, "pallet", "pallets")}</strong>
                    <span className="muted">{countPhrase(load.expectedPieces, "piece", "pieces")}</span>
                  </div>
                  <div>
                    <span className="stat-label">Received</span>
                    <strong>{countPhrase(load.receivedPallets, "pallet", "pallets")}</strong>
                    <span className="muted">{countPhrase(load.receivedPieces, "piece", "pieces")}</span>
                  </div>
                  <div>
                    <span className="stat-label">Difference</span>
                    <strong>{received}</strong>
                  </div>
                </div>
                <div>
                  <p className="kicker">Putaway</p>
                  <LocationList value={load.putawayLocations ?? ""} />
                </div>
                <div>
                  <p className="kicker">Exceptions</p>
                  {load.exceptions.length === 0 ? (
                    <p className="empty">No damage, shortage, or overage.</p>
                  ) : (
                    <div className="stack">
                      {load.exceptions.map((exception) => (
                        <article className="exception" key={exception.id}>
                          <div className="driver-line">
                            <ExceptionBadge kind={exception.kind} />
                            {exception.quantity !== null ? (
                              <span>{countPhrase(exception.quantity, "unit", "units")}</span>
                            ) : (
                              <span className="muted">No quantity</span>
                            )}
                          </div>
                          <p className="notes">{exception.notes}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            {load.status === "arrived" ? (
              <div style={{ marginTop: 16 }}>
                <CompleteUnloadForm
                  loadId={load.id}
                  expectedPallets={load.expectedPallets}
                  expectedPieces={load.expectedPieces}
                  defaultStartedAt={localDateTimeInputValue()}
                  defaultFinishedAt={localDateTimeInputValue()}
                />
              </div>
            ) : null}
            {load.alterationNote ? (
              <div style={{ marginTop: 16 }}>
                <p className="kicker">What changed</p>
                <p className="notes">{load.alterationNote}</p>
              </div>
            ) : null}
          </section>
        </div>
        <aside className="action-card panel">
          <h2>{load.status === "altered" ? "Altered" : "Next stage"}</h2>
          {load.status === "new" ? (
            <AdvanceStageForm
              loadId={load.id}
              action={confirmLoadAction}
              label="Mark confirmed"
              pendingLabel="Saving…"
              hint="Confirmed means the warehouse confirmed this delivery is expected."
            />
          ) : null}
          {load.status === "confirmed" ? (
            <AdvanceStageForm
              loadId={load.id}
              action={arriveLoadAction}
              label="Mark arrived"
              pendingLabel="Saving…"
              hint="Arrived means the trailer is at the dock and has not been received."
            />
          ) : null}
          {load.status === "arrived" ? (
            <p className="hint">
              Received means the freight was unloaded, counted, sorted, and put away. Record that
              in the receipt form.
            </p>
          ) : null}
          {load.status === "received" ? <AlterDeliveryForm loadId={load.id} /> : null}
          {load.status === "altered" ? (
            <p className="hint">This delivery is Altered. The change stays on the record.</p>
          ) : null}
        </aside>
      </div>
    </>
  );
}

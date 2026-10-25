import Link from "next/link";
import { notFound } from "next/navigation";
import {
  applyFeeAction,
  resolveClaimAction,
  sendWarningAction,
  waiveClaimAction,
} from "../../actions";
import { Banner } from "../../../components/Banner";
import { PageHeader } from "../../../components/PageHeader";
import { EmailBadge, SourceBadge, StatusBadge } from "../../../components/StatusBadge";
import { SubmitButton } from "../../../components/SubmitButton";
import { getClaimDetail, warningEmailForClaim } from "../../../lib/claims";
import { getStore } from "../../../lib/db";
import { firstParam, formatWhen } from "../../../lib/format";
import { describeMailMode } from "../../../lib/mailer";
import { formatMoney } from "../../../lib/money";
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  allowedActions,
  type EmailRecord,
  type FeeBasis,
} from "../../../lib/types";

function emailRoute(email: EmailRecord): string {
  if (email.transport === "outbox") return "Outbox";
  if (email.transport === "smtp2go") {
    return email.providerMessageId
      ? `Accepted by SMTP2GO (${email.providerMessageId})`
      : "SMTP2GO";
  }
  return "SMTP";
}

export const dynamic = "force-dynamic";

function basisLabel(basis: FeeBasis): string {
  return basis === "claim_type" ? "Contract term for this claim type" : "Default contract fee";
}

export default async function ClaimDetailPage({
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
  const claim = await getClaimDetail(await getStore(), id);
  if (!claim) notFound();

  const actions = allowedActions(claim.status);
  const mailMode = describeMailMode(process.env);
  const preview = actions.sendWarning ? warningEmailForClaim(claim) : null;
  const closed = claim.status === "resolved" || claim.status === "waived";

  return (
    <>
      <PageHeader
        kicker={`Claim ${claim.id}`}
        title={claim.claimTypeLabel}
        lede={claim.claimTypeDescription}
        action={
          <Link href="/claims" className="button quiet">
            All claims
          </Link>
        }
      />
      <Banner error={firstParam(query.error)} notice={firstParam(query.notice)} />
      <div className="detail">
        <div className="panels">
          <section className="panel">
            <div className="section-head">
              <h2>Record</h2>
              <StatusBadge status={claim.status} />
            </div>
            <dl className="facts">
              <div>
                <dt>Driver</dt>
                <dd>
                  <Link href={`/drivers/${claim.driverId}`}>{claim.driverName}</Link>
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{claim.driverEmail}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>{formatWhen(claim.occurredAt)}</dd>
              </div>
              <div>
                <dt>Order</dt>
                <dd className="mono">{claim.orderReference ?? "None recorded"}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  <SourceBadge source={claim.source} />{" "}
                  <span className="muted">{SOURCE_LABELS[claim.source]} entry</span>
                </dd>
              </div>
              <div>
                <dt>{claim.feeAmountCents === null ? "Contract fee" : "Fee applied"}</dt>
                <dd>
                  {claim.feeAmountCents === null ? (
                    <>
                      {formatMoney(claim.contractFeeCents)}
                      <div className="muted">{basisLabel(claim.contractFeeBasis)}</div>
                    </>
                  ) : (
                    <>
                      {formatMoney(claim.feeAmountCents)}
                      <div className="muted">
                        {claim.feeBasis ? basisLabel(claim.feeBasis) : "Contract fee"}
                        {claim.feeAppliedAt ? ` · ${formatWhen(claim.feeAppliedAt)}` : ""}
                      </div>
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </section>
          <section className="panel">
            <h2>What went wrong</h2>
            <p className="notes">{claim.notes}</p>
          </section>
          <section className="panel">
            <h2>History</h2>
            <ol className="timeline">
              {claim.events.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.createdAt}>{formatWhen(event.createdAt)}</time>
                  <p className="notes">{event.message}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <h2>Emails</h2>
            {claim.emails.length === 0 ? (
              <p className="empty">No emails yet. A warning is sent only when you choose to send it.</p>
            ) : (
              <div className="stack">
                {claim.emails.map((email) => (
                  <article className="email" key={email.id}>
                    <div className="driver-line">
                      <strong>{email.subject}</strong>
                      <EmailBadge status={email.status} />
                    </div>
                    <p className="hint">
                      To {email.to} · {emailRoute(email)} ·{" "}
                      {formatWhen(email.sentAt ?? email.createdAt)}
                    </p>
                    {email.error ? <p className="banner bad">{email.error}</p> : null}
                    <pre className="email-body">{email.body}</pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="action-card panel">
          <h2>{closed ? "Closed" : "Next step"}</h2>
          {closed ? (
            <p className="hint">
              This claim is {STATUS_LABELS[claim.status].toLowerCase()}. The record stays as it is.
            </p>
          ) : null}
          {actions.sendWarning && preview ? (
            <form action={sendWarningAction} className="stack-tight">
              <input type="hidden" name="claimId" value={claim.id} />
              <p className="hint">{mailMode.detail}</p>
              <div className="preview">
                <p className="kicker">Email preview</p>
                <strong>{preview.subject}</strong>
                <pre>{preview.text}</pre>
              </div>
              <SubmitButton className="button copper" pendingLabel="Sending…">
                Send warning email
              </SubmitButton>
            </form>
          ) : null}
          {actions.applyFee ? (
            <form action={applyFeeAction} className="stack-tight">
              <input type="hidden" name="claimId" value={claim.id} />
              <p>
                Apply <strong>{formatMoney(claim.contractFeeCents)}</strong>
              </p>
              <p className="hint">
                {basisLabel(claim.contractFeeBasis)}. Taken from the driver&apos;s contract. This does
                not contact a payment service.
              </p>
              <p className="hint">
                <Link href={`/drivers/${claim.driverId}`}>Edit contract terms</Link> first if the
                amount should change.
              </p>
              <SubmitButton className="button navy" pendingLabel="Applying…">
                Apply fee of {formatMoney(claim.contractFeeCents)}
              </SubmitButton>
            </form>
          ) : null}
          {actions.resolve ? (
            <form action={resolveClaimAction} className="stack-tight">
              <input type="hidden" name="claimId" value={claim.id} />
              <p className="hint">Close the claim. The fee record stays.</p>
              <label className="field">
                Note for the record
                <input name="note" maxLength={500} placeholder="Optional" />
              </label>
              <SubmitButton className="button good" pendingLabel="Closing…">
                Resolve
              </SubmitButton>
            </form>
          ) : null}
          {actions.waive ? (
            <>
              {(actions.sendWarning || actions.applyFee) ? <hr className="divider" /> : null}
              <form action={waiveClaimAction} className="stack-tight">
                <input type="hidden" name="claimId" value={claim.id} />
                <p className="hint">Close the claim without a fee.</p>
                <label className="field">
                  Note for the record
                  <input name="note" maxLength={500} placeholder="Optional" />
                </label>
                <SubmitButton className="button quiet" pendingLabel="Waiving…">
                  Waive
                </SubmitButton>
              </form>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}

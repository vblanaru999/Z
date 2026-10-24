import Link from "next/link";
import { ClaimsTable } from "../components/ClaimsTable";
import { EmailBadge } from "../components/StatusBadge";
import { PageHeader } from "../components/PageHeader";
import { dashboardStats, listClaims, listRecentEmails } from "../lib/claims";
import { getDb } from "../lib/db";
import { formatWhen } from "../lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open claims" };

export default function DashboardPage() {
  const db = getDb();
  const stats = dashboardStats(db);
  const open = listClaims(db, { openOnly: true });
  const emails = listRecentEmails(db, 6);

  return (
    <>
      <PageHeader
        kicker="Board"
        title="Open claims"
        lede="Procedure misses that are still open. Resolved and waived claims stay in the archive."
        action={
          <Link href="/claims/new" className="button primary">
            Record a claim
          </Link>
        }
      />
      <section className="stats" aria-label="Claim counts">
        <div className="stat">
          <div className="stat-value">{stats.open}</div>
          <div className="stat-label">Open</div>
          <div className="stat-hint">Recorded, warned, or fee applied</div>
        </div>
        <Link className="stat" href="/claims?status=recorded">
          <div className="stat-value">{stats.recorded}</div>
          <div className="stat-label">Recorded</div>
          <div className="stat-hint">No warning yet</div>
        </Link>
        <Link className="stat" href="/claims?status=warning_sent">
          <div className="stat-value">{stats.warningSent}</div>
          <div className="stat-label">Warning sent</div>
          <div className="stat-hint">Waiting on a fee decision</div>
        </Link>
        <Link className="stat" href="/claims?status=fee_applied">
          <div className="stat-value">{stats.feeApplied}</div>
          <div className="stat-label">Fee applied</div>
          <div className="stat-hint">Not resolved yet</div>
        </Link>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>Still open</h2>
          <Link href="/claims">All claims</Link>
        </div>
        <ClaimsTable
          claims={open}
          empty="No open claims. Record one when a driver misses a step."
        />
      </section>
      {emails.length > 0 ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="section-head">
            <h2>Recent emails</h2>
          </div>
          <ul className="timeline">
            {emails.map((email) => (
              <li key={email.id}>
                <time dateTime={email.createdAt}>{formatWhen(email.createdAt)}</time>
                <div>
                  <EmailBadge status={email.status} />{" "}
                  <Link href={`/claims/${email.claimId}`}>{email.driverName}</Link>
                  <div>{email.subject}</div>
                  {email.error ? <div className="muted">{email.error}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

import Link from "next/link";
import { formatWhen } from "../lib/format";
import { formatMoney } from "../lib/money";
import type { ClaimListItem } from "../lib/types";
import { SourceBadge, StatusBadge } from "./StatusBadge";

export function ClaimsTable({
  claims,
  showDriver = true,
  empty,
}: {
  claims: ClaimListItem[];
  showDriver?: boolean;
  empty: string;
}) {
  if (claims.length === 0) {
    return <p className="empty">{empty}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data claims">
        <colgroup>
          <col className="col-id" />
          <col className="col-when" />
          {showDriver ? <col className="col-driver" /> : null}
          <col className="col-what" />
          <col className="col-order" />
          <col className="col-fee" />
          <col className="col-status" />
          <col className="col-source" />
        </colgroup>
        <thead>
          <tr>
            <th>Claim ID</th>
            <th>When</th>
            {showDriver ? <th>Driver</th> : null}
            <th>What happened</th>
            <th>Order</th>
            <th>Fee applied</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td data-label="Claim ID" className="mono">{claim.id}</td>
              <td data-label="When" title={formatWhen(claim.occurredAt)}>{formatWhen(claim.occurredAt)}</td>
              {showDriver ? (
                <td data-label="Driver" title={claim.driverName}>{claim.driverName}</td>
              ) : null}
              <td data-label="What happened">
                <Link href={`/claims/${claim.id}`} className="row-link" title={claim.claimTypeLabel}>
                  {claim.claimTypeLabel}
                </Link>
              </td>
              <td data-label="Order" className="mono" title={claim.orderReference ?? undefined}>
                {claim.orderReference ?? "—"}
              </td>
              <td data-label="Fee applied" className="mono">
                {claim.feeAmountCents === null ? "—" : formatMoney(claim.feeAmountCents)}
              </td>
              <td data-label="Status">
                <StatusBadge status={claim.status} />
              </td>
              <td data-label="Source">
                <SourceBadge source={claim.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

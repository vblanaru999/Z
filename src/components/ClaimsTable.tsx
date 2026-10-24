import Link from "next/link";
import { formatWhen } from "../lib/format";
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
      <table className="data">
        <thead>
          <tr>
            <th>When</th>
            {showDriver ? <th>Driver</th> : null}
            <th>What happened</th>
            <th>Order</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td data-label="When">{formatWhen(claim.occurredAt)}</td>
              {showDriver ? <td data-label="Driver">{claim.driverName}</td> : null}
              <td data-label="What happened">
                <Link href={`/claims/${claim.id}`} className="row-link">
                  {claim.claimTypeLabel}
                </Link>
              </td>
              <td data-label="Order" className="mono">
                {claim.orderReference ?? "—"}
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

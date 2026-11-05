import Link from "next/link";
import { formatWhen } from "../lib/format";
import { countPhrase, stagePair, type LoadListItem } from "../lib/load-types";
import { LoadStatusBadge } from "./StatusBadge";

export function LoadsTable({ loads, empty }: { loads: LoadListItem[]; empty: string }) {
  if (loads.length === 0) {
    return <p className="empty">{empty}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Arrival</th>
            <th>Carrier</th>
            <th>Trailer</th>
            <th>Door</th>
            <th>Expected</th>
            <th>Stages</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loads.map((load) => {
            const stages = stagePair(load.status);
            return (
              <tr key={load.id}>
                <td data-label="Arrival">{formatWhen(load.arrivedAt)}</td>
                <td data-label="Carrier">{load.carrier}</td>
                <td data-label="Trailer">
                  <Link href={`/inbound/${load.id}`} className="row-link">
                    {load.trailerNumber}
                  </Link>
                  <div className="muted mono">{load.bolPro}</div>
                </td>
                <td data-label="Door">{load.dockDoor}</td>
                <td data-label="Expected">
                  {countPhrase(load.expectedPallets, "pallet", "pallets")}
                  <div className="muted">{countPhrase(load.expectedPieces, "piece", "pieces")}</div>
                </td>
                <td data-label="Stages">
                  <dl className="stage-pair">
                    <div>
                      <dt>Receiving</dt>
                      <dd>{stages.receiving}</dd>
                    </div>
                    <div>
                      <dt>Unloading</dt>
                      <dd>{stages.unloading}</dd>
                    </div>
                  </dl>
                </td>
                <td data-label="Status">
                  <LoadStatusBadge status={load.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

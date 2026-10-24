import Link from "next/link";
import { ClaimsTable } from "../../components/ClaimsTable";
import { PageHeader } from "../../components/PageHeader";
import { listClaimTypes } from "../../lib/catalog";
import { listClaims } from "../../lib/claims";
import { getDb } from "../../lib/db";
import { listDrivers } from "../../lib/drivers";
import { firstParam } from "../../lib/format";
import { CLAIM_STATUSES, STATUS_LABELS, isClaimStatus, type ClaimFilter } from "../../lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claims" };

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ driver?: string | string[]; type?: string | string[]; status?: string | string[] }>;
}) {
  const query = await searchParams;
  const db = getDb();
  const drivers = listDrivers(db);
  const types = listClaimTypes(db);
  const driverRaw = firstParam(query.driver);
  const typeRaw = firstParam(query.type);
  const statusRaw = firstParam(query.status);
  const filter: ClaimFilter = {};
  const driverId = Number(driverRaw);
  const claimTypeId = Number(typeRaw);
  if (driverRaw && Number.isInteger(driverId)) filter.driverId = driverId;
  if (typeRaw && Number.isInteger(claimTypeId)) filter.claimTypeId = claimTypeId;
  if (statusRaw && isClaimStatus(statusRaw)) filter.status = statusRaw;
  const claims = listClaims(db, filter);

  return (
    <>
      <PageHeader
        kicker="Archive"
        title="Claims"
        lede="Filter by driver, claim type, or status. Open claims also appear on the dashboard."
        action={
          <Link href="/claims/new" className="button primary">
            Record a claim
          </Link>
        }
      />
      <form className="filters" method="get">
        <label className="field">
          Driver
          <select name="driver" defaultValue={filter.driverId ? String(filter.driverId) : ""}>
            <option value="">All drivers</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Type
          <select name="type" defaultValue={filter.claimTypeId ? String(filter.claimTypeId) : ""}>
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select name="status" defaultValue={filter.status ?? ""}>
            <option value="">All statuses</option>
            {CLAIM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" type="submit">
          Apply
        </button>
        <Link href="/claims" className="button quiet">
          Clear
        </Link>
      </form>
      <section className="panel">
        <div className="section-head">
          <h2>
            {claims.length} {claims.length === 1 ? "claim" : "claims"}
          </h2>
        </div>
        <ClaimsTable claims={claims} empty="No claims match these filters." />
      </section>
    </>
  );
}

import Link from "next/link";
import { ClaimForm } from "../../../components/ClaimForm";
import { PageHeader } from "../../../components/PageHeader";
import { listClaimTypes } from "../../../lib/catalog";
import { getDb } from "../../../lib/db";
import { listDrivers } from "../../../lib/drivers";
import { localDateInputValue } from "../../../lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record a claim" };

export default function NewClaimPage() {
  const db = getDb();
  const drivers = listDrivers(db);
  const claimTypes = listClaimTypes(db);

  return (
    <>
      <PageHeader
        kicker="Manual entry"
        title="Record a claim"
        lede="Write down what the driver missed. You send the warning email afterwards, as its own step."
      />
      {drivers.length === 0 ? (
        <div className="empty">
          <p>Add a driver before recording a claim.</p>
          <p>
            <Link href="/drivers/new" className="button primary">
              Add a driver
            </Link>
          </p>
        </div>
      ) : (
        <section className="panel">
          <ClaimForm
            drivers={drivers}
            claimTypes={claimTypes}
            defaultOccurredAt={localDateInputValue()}
          />
        </section>
      )}
    </>
  );
}

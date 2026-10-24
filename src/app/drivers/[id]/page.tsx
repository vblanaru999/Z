import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "../../../components/Banner";
import { ClaimsTable } from "../../../components/ClaimsTable";
import { DriverForm } from "../../../components/DriverForm";
import { PageHeader } from "../../../components/PageHeader";
import { listClaimTypes } from "../../../lib/catalog";
import { listClaims } from "../../../lib/claims";
import { getDb } from "../../../lib/db";
import { getDriver, listDriverFees } from "../../../lib/drivers";
import { firstParam } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function EditDriverPage({
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
  const db = getDb();
  const driver = getDriver(db, id);
  if (!driver) notFound();
  const claims = listClaims(db, { driverId: id });

  return (
    <>
      <PageHeader
        kicker="Contract"
        title={driver.name}
        lede={driver.email}
        action={
          <Link href="/drivers" className="button quiet">
            All drivers
          </Link>
        }
      />
      <Banner error={firstParam(query.error)} notice={firstParam(query.notice)} />
      <section className="panel">
        <DriverForm
          driver={driver}
          claimTypes={listClaimTypes(db)}
          typeFees={listDriverFees(db, id)}
        />
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="section-head">
          <h2>Claims</h2>
          <Link href={`/claims/new`}>Record a claim</Link>
        </div>
        <ClaimsTable
          claims={claims}
          showDriver={false}
          empty="No claims for this driver yet."
        />
      </section>
    </>
  );
}

import { DriverForm } from "../../../components/DriverForm";
import { PageHeader } from "../../../components/PageHeader";
import { listClaimTypes } from "../../../lib/catalog";
import { getDb } from "../../../lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a driver" };

export default function NewDriverPage() {
  const claimTypes = listClaimTypes(getDb());
  return (
    <>
      <PageHeader
        kicker="Contracts"
        title="Add a driver"
        lede="The default fee is the contract amount. You can set a different amount for a claim type."
      />
      <section className="panel">
        <DriverForm claimTypes={claimTypes} typeFees={[]} />
      </section>
    </>
  );
}

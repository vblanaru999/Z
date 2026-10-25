import { DriverForm } from "../../../components/DriverForm";
import { PageHeader } from "../../../components/PageHeader";
import { listClaimTypes } from "../../../lib/catalog";
import { getStore } from "../../../lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a driver" };

export default async function NewDriverPage() {
  const claimTypes = await listClaimTypes(await getStore());
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

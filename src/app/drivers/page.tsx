import Link from "next/link";
import { PageHeader } from "../../components/PageHeader";
import { getStore } from "../../lib/db";
import { listDrivers } from "../../lib/drivers";
import { formatMoney } from "../../lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const drivers = await listDrivers(await getStore());

  return (
    <>
      <PageHeader
        kicker="Contracts"
        title="Drivers"
        lede="Name, email, and the fee a person can apply from the contract. Fees are not charged on their own."
        action={
          <Link href="/drivers/new" className="button primary">
            Add a driver
          </Link>
        }
      />
      {drivers.length === 0 ? (
        <p className="empty">No drivers yet. Add one before recording a claim.</p>
      ) : (
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Default fee</th>
                  <th>Type fees</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id}>
                    <td data-label="Name">
                      <Link href={`/drivers/${driver.id}`} className="row-link">
                        {driver.name}
                      </Link>
                    </td>
                    <td data-label="Email">{driver.email}</td>
                    <td data-label="Default fee">{formatMoney(driver.defaultFeeCents)}</td>
                    <td data-label="Type fees">
                      {driver.typeFees.length === 0 ? (
                        <span className="muted">Default for every type</span>
                      ) : (
                        <ul className="fee-list">
                          {driver.typeFees.map((fee) => (
                            <li key={fee.claimTypeId}>
                              {fee.claimTypeLabel}: {formatMoney(fee.amountCents)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

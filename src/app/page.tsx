import Link from "next/link";
import { LoadsTable } from "../components/LoadsTable";
import { PageHeader } from "../components/PageHeader";
import { firstParam } from "../lib/format";
import { isLoadStatus, LOAD_STATUSES, LOAD_STATUS_LABELS, STAGE_MEANINGS, type LoadStatus } from "../lib/load-types";
import { inboundDataDir, listLoads, loadStats } from "../lib/loads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deliveries" };

const EMPTY: Record<LoadStatus | "all", string> = {
  new: "No deliveries are New.",
  confirmed: "No deliveries are Confirmed.",
  arrived: "No deliveries have Arrived.",
  received: "No deliveries are Received.",
  altered: "No deliveries are Altered.",
  all: "No inbound deliveries yet.",
};

function selectedStatus(raw: string | undefined): LoadStatus | "all" {
  if (raw === "all") return "all";
  if (raw && isLoadStatus(raw)) return raw;
  return "all";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const query = await searchParams;
  const status = selectedStatus(firstParam(query.status));
  const dir = inboundDataDir();
  const stats = loadStats(dir);
  const loads = listLoads(dir, status === "all" ? {} : { status });
  const total = LOAD_STATUSES.reduce((sum, key) => sum + stats[key], 0);

  return (
    <>
      <PageHeader
        kicker="Inbound"
        title="Inbound deliveries"
        lede="A delivery moves through New, Confirmed, Arrived, Received, and Altered. The list shows the current stage."
        action={
          <Link href="/inbound/new" className="button primary">
            New delivery
          </Link>
        }
      />
      <section className="stats stage-stats" aria-label="Delivery counts">
        {LOAD_STATUSES.map((key) => (
          <Link
            key={key}
            className={status === key ? "stat current" : "stat"}
            href={`/?status=${key}`}
          >
            <div className="stat-value">{stats[key]}</div>
            <div className="stat-label">{LOAD_STATUS_LABELS[key]}</div>
            <div className="stat-hint">{STAGE_MEANINGS[key]}</div>
          </Link>
        ))}
        <Link className={status === "all" ? "stat current" : "stat"} href="/?status=all">
          <div className="stat-value">{total}</div>
          <div className="stat-label">All</div>
          <div className="stat-hint">Every delivery</div>
        </Link>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>{status === "all" ? "All deliveries" : LOAD_STATUS_LABELS[status]}</h2>
        </div>
        <LoadsTable loads={loads} empty={EMPTY[status]} />
      </section>
    </>
  );
}

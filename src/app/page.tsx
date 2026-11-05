import Link from "next/link";
import { LoadsTable } from "../components/LoadsTable";
import { PageHeader } from "../components/PageHeader";
import { getDb } from "../lib/db";
import { firstParam } from "../lib/format";
import { isLoadStatus, type LoadStatus } from "../lib/load-types";
import { listLoads, loadStats } from "../lib/loads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Queue" };

const EMPTY: Record<LoadStatus | "all", string> = {
  waiting: "No trailers are waiting. Receive one when it arrives at the dock.",
  unloading: "Nothing is being unloaded right now.",
  done: "No loads have been finished yet.",
  all: "No inbound loads yet.",
};

const SECTION: Record<LoadStatus | "all", string> = {
  waiting: "Waiting queue",
  unloading: "Unloading now",
  done: "Done",
  all: "All loads",
};

function selectedStatus(raw: string | undefined): LoadStatus | "all" {
  if (raw === "all") return "all";
  if (raw && isLoadStatus(raw)) return raw;
  return "waiting";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const query = await searchParams;
  const status = selectedStatus(firstParam(query.status));
  const db = getDb();
  const stats = loadStats(db);
  const loads = listLoads(db, status === "all" ? {} : { status });
  const total = stats.waiting + stats.unloading + stats.done;

  return (
    <>
      <PageHeader
        kicker={status === "waiting" ? "Queue" : "Inbound"}
        title="Inbound loads"
        lede="Stage 1 records the trailer when it arrives and leaves it waiting. Stage 2 unloads, sorts, and puts the same load away."
        action={
          <Link href="/inbound/new" className="button primary">
            Receive a trailer
          </Link>
        }
      />
      <section className="stats" aria-label="Load counts">
        <Link className={status === "waiting" ? "stat current" : "stat"} href="/">
          <div className="stat-value">{stats.waiting}</div>
          <div className="stat-label">Waiting</div>
          <div className="stat-hint">Received, not unloaded</div>
        </Link>
        <Link className={status === "unloading" ? "stat current" : "stat"} href="/?status=unloading">
          <div className="stat-value">{stats.unloading}</div>
          <div className="stat-label">Unloading</div>
          <div className="stat-hint">Started, not finished</div>
        </Link>
        <Link className={status === "done" ? "stat current" : "stat"} href="/?status=done">
          <div className="stat-value">{stats.done}</div>
          <div className="stat-label">Done</div>
          <div className="stat-hint">Unloaded and put away</div>
        </Link>
        <Link className={status === "all" ? "stat current" : "stat"} href="/?status=all">
          <div className="stat-value">{total}</div>
          <div className="stat-label">All loads</div>
          <div className="stat-hint">Both stages, every status</div>
        </Link>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>{SECTION[status]}</h2>
        </div>
        <LoadsTable loads={loads} empty={EMPTY[status]} />
      </section>
    </>
  );
}

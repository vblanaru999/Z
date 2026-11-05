import { redirect } from "next/navigation";
import { firstParam } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function InboundAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const status = firstParam((await searchParams).status);
  redirect(status ? `/?status=${encodeURIComponent(status)}` : "/");
}

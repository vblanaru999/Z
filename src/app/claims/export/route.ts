import { claimFilterFromQuery } from "../../../lib/claim-query";
import { listClaims } from "../../../lib/claims";
import { claimsWorkbook } from "../../../lib/claims-export";
import { getStore } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const filter = claimFilterFromQuery({
    driver: url.searchParams.get("driver") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  const claims = await listClaims(await getStore(), filter);
  const body = claimsWorkbook(claims);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="claims.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

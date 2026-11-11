import { firstParam } from "./format";
import { isClaimStatus, type ClaimFilter } from "./types";

/** The claims-list filters, read from the page query string. */
export function claimFilterFromQuery(query: {
  driver?: string | string[];
  type?: string | string[];
  status?: string | string[];
}): ClaimFilter {
  const filter: ClaimFilter = {};
  const driverRaw = firstParam(query.driver);
  const typeRaw = firstParam(query.type);
  const statusRaw = firstParam(query.status);
  const driverId = Number(driverRaw);
  const claimTypeId = Number(typeRaw);
  if (driverRaw && Number.isInteger(driverId) && driverId > 0) filter.driverId = driverId;
  if (typeRaw && Number.isInteger(claimTypeId) && claimTypeId > 0) filter.claimTypeId = claimTypeId;
  if (statusRaw && isClaimStatus(statusRaw)) filter.status = statusRaw;
  return filter;
}

export function claimsExportHref(filter: ClaimFilter): string {
  const params = new URLSearchParams();
  if (filter.driverId) params.set("driver", String(filter.driverId));
  if (filter.claimTypeId) params.set("type", String(filter.claimTypeId));
  if (filter.status) params.set("status", filter.status);
  const query = params.toString();
  return query ? `/claims/export?${query}` : "/claims/export";
}

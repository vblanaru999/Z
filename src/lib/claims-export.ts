import { formatWhen } from "./format";
import { formatMoney } from "./money";
import { SOURCE_LABELS, STATUS_LABELS, type ClaimListItem } from "./types";
import { workbook, type WorkbookCell } from "./xlsx";

export const CLAIM_EXPORT_HEADERS = [
  "Claim ID",
  "When",
  "Driver",
  "What happened",
  "Order",
  "Fee applied",
  "Status",
  "Source",
] as const;

export function claimExportRows(claims: ClaimListItem[]): WorkbookCell[][] {
  return [
    [...CLAIM_EXPORT_HEADERS],
    ...claims.map((claim) => [
      claim.id,
      formatWhen(claim.occurredAt),
      claim.driverName,
      claim.claimTypeLabel,
      claim.orderReference ?? "—",
      claim.feeAmountCents === null ? "—" : formatMoney(claim.feeAmountCents),
      STATUS_LABELS[claim.status],
      SOURCE_LABELS[claim.source],
    ]),
  ];
}

export function claimsWorkbook(claims: ClaimListItem[]): Buffer {
  return workbook("Claims", claimExportRows(claims));
}

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claimFilterFromQuery, claimsExportHref } from "../src/lib/claim-query";
import { CLAIM_EXPORT_HEADERS, claimExportRows, claimsWorkbook } from "../src/lib/claims-export";
import { formatMoney } from "../src/lib/money";
import { formatWhen } from "../src/lib/format";
import type { ClaimListItem } from "../src/lib/types";

const warning: ClaimListItem = {
  id: 1,
  driverId: 4,
  driverName: "Maria Alvarez",
  claimTypeId: 2,
  claimTypeLabel: "Delivery label not scanned",
  orderReference: null,
  occurredAt: "2026-03-04T15:30:00.000Z",
  status: "warning_sent",
  source: "manual",
  feeAmountCents: null,
};

const applied: ClaimListItem = {
  id: 2,
  driverId: 9,
  driverName: "James Okonkwo",
  claimTypeId: 1,
  claimTypeLabel: "Order not closed in the app",
  orderReference: "ORD-100",
  occurredAt: "2026-03-05T18:00:00.000Z",
  status: "fee_applied",
  source: "xcelerator",
  feeAmountCents: 2500,
};

describe("claims export", () => {
  it("keeps the list columns in order", () => {
    const rows = claimExportRows([warning, applied]);
    expect(rows[0]).toEqual([...CLAIM_EXPORT_HEADERS]);
    expect(rows[1]).toEqual([
      1,
      formatWhen(warning.occurredAt),
      "Maria Alvarez",
      "Delivery label not scanned",
      "—",
      "—",
      "Warning sent",
      "Manual",
    ]);
    expect(rows[2]).toEqual([
      2,
      formatWhen(applied.occurredAt),
      "James Okonkwo",
      "Order not closed in the app",
      "ORD-100",
      formatMoney(2500),
      "Fee applied",
      "Xcelerator",
    ]);
  });

  it("writes an xlsx workbook Excel can open", () => {
    const bytes = claimsWorkbook([warning]);
    const dir = mkdtempSync(join(tmpdir(), "claims-xlsx-"));
    const file = join(dir, "claims.xlsx");
    writeFileSync(file, bytes);
    const script = [
      "import sys, zipfile, xml.etree.ElementTree as ET",
      "ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}",
      "with zipfile.ZipFile(sys.argv[1]) as z:",
      "    root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))",
      "    rows = []",
      "    for row in root.findall('m:sheetData/m:row', ns):",
      "        cells = []",
      "        for cell in row.findall('m:c', ns):",
      "            text = cell.find('m:is/m:t', ns)",
      "            value = cell.find('m:v', ns)",
      "            cells.append(text.text if text is not None else value.text)",
      "        rows.append('|'.join(cells))",
      "    print(chr(10).join(rows))",
    ].join("\n");
    const sheet = execFileSync("python3", ["-c", script, file], { encoding: "utf8" });
    const [header, row] = sheet.trim().split("\n");
    expect(header).toBe(CLAIM_EXPORT_HEADERS.join("|"));
    expect(row?.startsWith("1|")).toBe(true);
    expect(row).toContain("Maria Alvarez");
    expect(row).toContain("—|—|Warning sent|Manual");
  });

  it("follows the claims page filters", () => {
    expect(
      claimFilterFromQuery({ driver: "3", type: "2", status: "fee_applied" }),
    ).toEqual({ driverId: 3, claimTypeId: 2, status: "fee_applied" });
    expect(claimFilterFromQuery({ driver: "0", type: "nope", status: "open" })).toEqual({});
    expect(claimsExportHref({ driverId: 3, status: "recorded" })).toBe(
      "/claims/export?driver=3&status=recorded",
    );
    expect(claimsExportHref({})).toBe("/claims/export");
  });
});

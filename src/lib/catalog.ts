import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "./format";
import { rowNumber, rowString, type SqlRow } from "./rows";
import type { ClaimType } from "./types";

export const CLAIM_TYPE_SEEDS: readonly {
  code: string;
  label: string;
  description: string;
}[] = [
  {
    code: "order_not_closed",
    label: "Order not closed in the app",
    description: "The order was left open in the driver app after the stop.",
  },
  {
    code: "label_not_scanned",
    label: "Delivery label not scanned",
    description: "The delivery label was not scanned at the stop.",
  },
  {
    code: "poor_delivery_photo",
    label: "Poor or missing delivery photo attached to the order",
    description:
      "The order has no delivery photo, or the photo does not show the delivery.",
  },
];

export function seedClaimTypes(db: DatabaseSync): void {
  const insert = db.prepare(
    `INSERT INTO claim_types (code, label, description, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       label = excluded.label,
       description = excluded.description`,
  );
  const createdAt = nowIso();
  for (const type of CLAIM_TYPE_SEEDS) {
    insert.run(type.code, type.label, type.description, createdAt);
  }
}

function mapClaimType(row: SqlRow): ClaimType {
  return {
    id: rowNumber(row, "id"),
    code: rowString(row, "code"),
    label: rowString(row, "label"),
    description: rowString(row, "description"),
  };
}

export function listClaimTypes(db: DatabaseSync): ClaimType[] {
  const rows = db
    .prepare(
      `SELECT id, code, label, description
       FROM claim_types
       ORDER BY id ASC`,
    )
    .all() as SqlRow[];
  return rows.map(mapClaimType);
}

export function getClaimType(db: DatabaseSync, id: number): ClaimType | undefined {
  const row = db
    .prepare(
      `SELECT id, code, label, description
       FROM claim_types
       WHERE id = ?`,
    )
    .get(id) as SqlRow | undefined;
  return row ? mapClaimType(row) : undefined;
}

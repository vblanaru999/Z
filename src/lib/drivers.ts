import type { DatabaseSync } from "node:sqlite";
import { listClaimTypes } from "./catalog";
import { insertId, withTransaction } from "./db";
import { AppError } from "./errors";
import { nowIso } from "./format";
import { rowNumber, rowString, type SqlRow } from "./rows";
import type { Driver, DriverFee, DriverInput, DriverListItem } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDriverInput(
  input: DriverInput,
  knownTypeIds: ReadonlySet<number>,
): DriverInput {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw new AppError("Enter the driver's name.");
  if (name.length > 120) {
    throw new AppError("Keep the driver's name under 120 characters.");
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    throw new AppError("Enter a valid email address.");
  }
  if (!Number.isInteger(input.defaultFeeCents) || input.defaultFeeCents < 0) {
    throw new AppError("Enter the default contract fee.");
  }
  if (input.defaultFeeCents > 100_000_000) {
    throw new AppError("The default contract fee cannot be more than $1,000,000.");
  }

  const typeFees: DriverInput["typeFees"] = [];
  const seen = new Set<number>();
  for (const fee of input.typeFees) {
    if (!knownTypeIds.has(fee.claimTypeId)) {
      throw new AppError("That claim type is not on file.");
    }
    if (seen.has(fee.claimTypeId)) continue;
    seen.add(fee.claimTypeId);
    if (!Number.isInteger(fee.amountCents) || fee.amountCents < 0) {
      throw new AppError("Enter a contract fee of zero or more.");
    }
    if (fee.amountCents > 100_000_000) {
      throw new AppError("A claim-type fee cannot be more than $1,000,000.");
    }
    typeFees.push({ claimTypeId: fee.claimTypeId, amountCents: fee.amountCents });
  }

  return { name, email, defaultFeeCents: input.defaultFeeCents, typeFees };
}

function mapDriver(row: SqlRow): Driver {
  return {
    id: rowNumber(row, "id"),
    name: rowString(row, "name"),
    email: rowString(row, "email"),
    defaultFeeCents: rowNumber(row, "default_fee_cents"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

function replaceFees(db: DatabaseSync, driverId: number, typeFees: DriverInput["typeFees"]): void {
  db.prepare("DELETE FROM driver_fee_terms WHERE driver_id = ?").run(driverId);
  const insert = db.prepare(
    `INSERT INTO driver_fee_terms (driver_id, claim_type_id, amount_cents)
     VALUES (?, ?, ?)`,
  );
  for (const fee of typeFees) {
    insert.run(driverId, fee.claimTypeId, fee.amountCents);
  }
}

export function createDriver(db: DatabaseSync, input: DriverInput): number {
  const known = new Set(listClaimTypes(db).map((type) => type.id));
  const data = validateDriverInput(input, known);
  return withTransaction(db, () => {
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO drivers (name, email, default_fee_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(data.name, data.email, data.defaultFeeCents, now, now);
    const id = insertId(result);
    replaceFees(db, id, data.typeFees);
    return id;
  });
}

export function updateDriver(db: DatabaseSync, id: number, input: DriverInput): void {
  const existing = getDriver(db, id);
  if (!existing) throw new AppError("Driver not found.");
  const known = new Set(listClaimTypes(db).map((type) => type.id));
  const data = validateDriverInput(input, known);
  withTransaction(db, () => {
    db.prepare(
      `UPDATE drivers
       SET name = ?, email = ?, default_fee_cents = ?, updated_at = ?
       WHERE id = ?`,
    ).run(data.name, data.email, data.defaultFeeCents, nowIso(), id);
    replaceFees(db, id, data.typeFees);
  });
}

export function getDriver(db: DatabaseSync, id: number): Driver | undefined {
  const row = db
    .prepare(
      `SELECT id, name, email, default_fee_cents, created_at, updated_at
       FROM drivers
       WHERE id = ?`,
    )
    .get(id) as SqlRow | undefined;
  return row ? mapDriver(row) : undefined;
}

export function getDriverByEmail(db: DatabaseSync, email: string): Driver | undefined {
  const row = db
    .prepare(
      `SELECT id, name, email, default_fee_cents, created_at, updated_at
       FROM drivers
       WHERE email = ?`,
    )
    .get(email) as SqlRow | undefined;
  return row ? mapDriver(row) : undefined;
}

export function listDriverFees(db: DatabaseSync, driverId: number): DriverFee[] {
  const rows = db
    .prepare(
      `SELECT f.claim_type_id, f.amount_cents, t.label AS claim_type_label
       FROM driver_fee_terms f
       JOIN claim_types t ON t.id = f.claim_type_id
       WHERE f.driver_id = ?
       ORDER BY t.id ASC`,
    )
    .all(driverId) as SqlRow[];
  return rows.map((row) => ({
    claimTypeId: rowNumber(row, "claim_type_id"),
    claimTypeLabel: rowString(row, "claim_type_label"),
    amountCents: rowNumber(row, "amount_cents"),
  }));
}

export function listDrivers(db: DatabaseSync): DriverListItem[] {
  const drivers = db
    .prepare(
      `SELECT id, name, email, default_fee_cents, created_at, updated_at
       FROM drivers
       ORDER BY name COLLATE NOCASE ASC, id ASC`,
    )
    .all() as SqlRow[];
  const fees = db
    .prepare(
      `SELECT f.driver_id, f.claim_type_id, f.amount_cents, t.label AS claim_type_label
       FROM driver_fee_terms f
       JOIN claim_types t ON t.id = f.claim_type_id
       ORDER BY t.id ASC`,
    )
    .all() as SqlRow[];
  const byDriver = new Map<number, DriverFee[]>();
  for (const row of fees) {
    const driverId = rowNumber(row, "driver_id");
    const list = byDriver.get(driverId) ?? [];
    list.push({
      claimTypeId: rowNumber(row, "claim_type_id"),
      claimTypeLabel: rowString(row, "claim_type_label"),
      amountCents: rowNumber(row, "amount_cents"),
    });
    byDriver.set(driverId, list);
  }
  return drivers.map((row) => {
    const driver = mapDriver(row);
    return { ...driver, typeFees: byDriver.get(driver.id) ?? [] };
  });
}

export function typeFeeCents(
  db: DatabaseSync,
  driverId: number,
  claimTypeId: number,
): number | null {
  const row = db
    .prepare(
      `SELECT amount_cents
       FROM driver_fee_terms
       WHERE driver_id = ? AND claim_type_id = ?`,
    )
    .get(driverId, claimTypeId) as SqlRow | undefined;
  return row ? rowNumber(row, "amount_cents") : null;
}

export function contractFee(
  defaultFeeCents: number,
  typeFee: number | null,
): { amountCents: number; basis: "default" | "claim_type" } {
  if (typeFee === null) {
    return { amountCents: defaultFeeCents, basis: "default" };
  }
  return { amountCents: typeFee, basis: "claim_type" };
}


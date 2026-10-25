import { listClaimTypes } from "./catalog";
import { AppError } from "./errors";
import { nowIso } from "./format";
import type { Store } from "./store";
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

export async function createDriver(store: Store, input: DriverInput): Promise<number> {
  const known = new Set((await listClaimTypes(store)).map((type) => type.id));
  const data = validateDriverInput(input, known);
  const now = nowIso();
  const id = await store.insertDriver({
    name: data.name,
    email: data.email,
    defaultFeeCents: data.defaultFeeCents,
    createdAt: now,
    updatedAt: now,
  });
  await store.replaceDriverFees(id, data.typeFees);
  return id;
}

export async function updateDriver(store: Store, id: number, input: DriverInput): Promise<void> {
  const existing = await getDriver(store, id);
  if (!existing) throw new AppError("Driver not found.");
  const known = new Set((await listClaimTypes(store)).map((type) => type.id));
  const data = validateDriverInput(input, known);
  await store.updateDriverRow(id, {
    name: data.name,
    email: data.email,
    defaultFeeCents: data.defaultFeeCents,
    updatedAt: nowIso(),
  });
  await store.replaceDriverFees(id, data.typeFees);
}

export function getDriver(store: Store, id: number): Promise<Driver | undefined> {
  return store.getDriver(id);
}

export function getDriverByEmail(store: Store, email: string): Promise<Driver | undefined> {
  return store.getDriverByEmail(email);
}

export function listDriverFees(store: Store, driverId: number): Promise<DriverFee[]> {
  return store.listDriverFees(driverId);
}

export function listDrivers(store: Store): Promise<DriverListItem[]> {
  return store.listDrivers();
}

export function typeFeeCents(
  store: Store,
  driverId: number,
  claimTypeId: number,
): Promise<number | null> {
  return store.typeFeeCents(driverId, claimTypeId);
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

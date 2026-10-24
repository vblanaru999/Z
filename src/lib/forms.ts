import { AppError } from "./errors";
import { parseIncidentDate } from "./format";
import { parseFeeToCents, parseOptionalFeeToCents } from "./money";
import type { ClaimInput, ClaimType, DriverInput } from "./types";

export function driverInputFromForm(
  formData: FormData,
  claimTypes: ClaimType[],
): DriverInput {
  const typeFees: DriverInput["typeFees"] = [];
  for (const type of claimTypes) {
    const raw = String(formData.get(`typeFee_${type.id}`) ?? "");
    const amount = parseOptionalFeeToCents(raw, `a fee for "${type.label}"`);
    if (amount !== null) {
      typeFees.push({ claimTypeId: type.id, amountCents: amount });
    }
  }
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    defaultFeeCents: parseFeeToCents(
      String(formData.get("defaultFee") ?? ""),
      "a default contract fee",
    ),
    typeFees,
  };
}

export function claimInputFromForm(formData: FormData): ClaimInput {
  const driverId = Number(formData.get("driverId"));
  const claimTypeId = Number(formData.get("claimTypeId"));
  if (!Number.isInteger(driverId) || driverId <= 0) {
    throw new AppError("Choose a driver.");
  }
  if (!Number.isInteger(claimTypeId) || claimTypeId <= 0) {
    throw new AppError("Choose a claim type.");
  }
  const orderRaw = String(formData.get("orderReference") ?? "").trim();
  if (orderRaw.length > 80) {
    throw new AppError("Keep the order reference under 80 characters.");
  }
  return {
    driverId,
    claimTypeId,
    orderReference: orderRaw || null,
    notes: String(formData.get("notes") ?? ""),
    occurredAt: parseIncidentDate(String(formData.get("occurredAt") ?? "")),
  };
}

export function noteFromForm(formData: FormData): string {
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 500) {
    throw new AppError("Keep the note under 500 characters.");
  }
  return note;
}

export function claimIdFromForm(formData: FormData): number {
  const id = Number(formData.get("claimId"));
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Claim not found.");
  return id;
}

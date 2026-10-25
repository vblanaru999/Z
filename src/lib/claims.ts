import { getClaimType } from "./catalog";
import { buildWarningEmail, type WarningEmail } from "./email-copy";
import { emailAuditMessage, type Mailer } from "./mailer";
import { AppError } from "./errors";
import { nowIso } from "./format";
import { contractFee, getDriver, typeFeeCents } from "./drivers";
import { formatMoney } from "./money";
import type { Store } from "./store";
import {
  STATUS_LABELS,
  type ClaimDetail,
  type ClaimFilter,
  type ClaimInput,
  type ClaimListItem,
  type DashboardStats,
  type FeeBasis,
  type RecentEmail,
} from "./types";

/**
 * Manual claim lifecycle:
 * recorded → warning_sent → fee_applied → resolved
 * recorded or warning_sent → waived
 *
 * Every claim created here has source `manual`.
 * `xcelerator` is reserved on the column for a later import.
 */

export async function createClaim(store: Store, input: ClaimInput): Promise<number> {
  const driver = await getDriver(store, input.driverId);
  if (!driver) throw new AppError("Choose a driver who is already on file.");
  const claimType = await getClaimType(store, input.claimTypeId);
  if (!claimType) throw new AppError("Choose a claim type.");
  const notes = input.notes.trim();
  if (!notes) throw new AppError("Describe what went wrong.");
  if (notes.length > 2000) {
    throw new AppError("Keep the description under 2000 characters.");
  }
  const orderReference = input.orderReference?.trim() || null;
  if (orderReference && orderReference.length > 80) {
    throw new AppError("Keep the order reference under 80 characters.");
  }
  const occurred = new Date(input.occurredAt);
  if (Number.isNaN(occurred.getTime())) {
    throw new AppError("Enter a valid date and time.");
  }

  const now = nowIso();
  const id = await store.insertClaim({
    driverId: driver.id,
    claimTypeId: claimType.id,
    orderReference,
    notes,
    occurredAt: occurred.toISOString(),
    createdAt: now,
    updatedAt: now,
  });
  await store.insertEvent({
    claimId: id,
    kind: "created",
    fromStatus: null,
    toStatus: "recorded",
    message: "Claim recorded by hand.",
    emailId: null,
    createdAt: now,
  });
  return id;
}

export function listClaims(store: Store, filter: ClaimFilter = {}): Promise<ClaimListItem[]> {
  return store.listClaims(filter);
}

export async function dashboardStats(store: Store): Promise<DashboardStats> {
  const counts = await store.countClaimsByStatus();
  const recorded = counts.recorded ?? 0;
  const warningSent = counts.warning_sent ?? 0;
  const feeApplied = counts.fee_applied ?? 0;
  return {
    open: recorded + warningSent + feeApplied,
    recorded,
    warningSent,
    feeApplied,
    resolved: counts.resolved ?? 0,
    waived: counts.waived ?? 0,
  };
}

export async function getClaimDetail(store: Store, id: number): Promise<ClaimDetail | undefined> {
  const row = await store.getClaimRecord(id);
  if (!row) return undefined;
  const fee = contractFee(row.defaultFeeCents, row.typeFeeCents);
  const [events, emails] = await Promise.all([store.listEvents(id), store.listEmails(id)]);
  return {
    id: row.id,
    driverId: row.driverId,
    driverName: row.driverName,
    driverEmail: row.driverEmail,
    claimTypeId: row.claimTypeId,
    claimTypeLabel: row.claimTypeLabel,
    claimTypeDescription: row.claimTypeDescription,
    orderReference: row.orderReference,
    notes: row.notes,
    occurredAt: row.occurredAt,
    status: row.status,
    source: row.source,
    feeAmountCents: row.feeAmountCents,
    feeAppliedAt: row.feeAppliedAt,
    feeBasis: row.feeBasis,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contractFeeCents: fee.amountCents,
    contractFeeBasis: fee.basis,
    defaultFeeCents: row.defaultFeeCents,
    events,
    emails,
  };
}

export function warningEmailForClaim(detail: ClaimDetail): WarningEmail {
  return buildWarningEmail({
    claimId: detail.id,
    driverName: detail.driverName,
    driverEmail: detail.driverEmail,
    claimTypeLabel: detail.claimTypeLabel,
    occurredAt: detail.occurredAt,
    orderReference: detail.orderReference,
    notes: detail.notes,
    feeAmountCents: detail.contractFeeCents,
    feeBasis: detail.contractFeeBasis,
    defaultFeeCents: detail.defaultFeeCents,
  });
}

export function listRecentEmails(store: Store, limit = 8): Promise<RecentEmail[]> {
  return store.listRecentEmails(limit);
}

async function requireDetail(store: Store, id: number): Promise<ClaimDetail> {
  const detail = await getClaimDetail(store, id);
  if (!detail) throw new AppError("Claim not found.");
  return detail;
}

export async function sendWarning(store: Store, claimId: number, mailer: Mailer): Promise<void> {
  const detail = await requireDetail(store, claimId);
  if (detail.status !== "recorded") {
    throw new AppError("A warning can only be sent while the claim is recorded.");
  }
  const email = warningEmailForClaim(detail);
  const result = await mailer.send({
    to: email.to,
    subject: email.subject,
    text: email.text,
  });
  const audit = emailAuditMessage(result, email.to);

  const current = await requireDetail(store, claimId);
  if (current.status !== "recorded") {
    throw new AppError("This claim changed before the warning was recorded. Reload and try again.");
  }
  const now = nowIso();
  const emailId = await store.insertEmail({
    claimId,
    driverId: detail.driverId,
    to: email.to,
    subject: email.subject,
    body: email.text,
    transport: audit.transport,
    status: audit.status,
    error: audit.error,
    providerMessageId: audit.providerMessageId,
    createdAt: now,
    sentAt: result.status === "sent" ? now : null,
  });
  await store.insertEvent({
    claimId,
    kind: "email",
    fromStatus: null,
    toStatus: null,
    message: audit.message,
    emailId,
    createdAt: now,
  });
  if (result.status !== "failed") {
    const changed = await store.updateClaimIfStatus(claimId, "recorded", {
      status: "warning_sent",
      updatedAt: now,
    });
    if (!changed) {
      throw new AppError(
        "This claim changed before the warning was recorded. Reload and try again.",
      );
    }
    await store.insertEvent({
      claimId,
      kind: "status_change",
      fromStatus: "recorded",
      toStatus: "warning_sent",
      message: "Status changed from Recorded to Warning sent.",
      emailId: null,
      createdAt: now,
    });
  }

  if (result.status === "failed") {
    throw new AppError(
      `The warning was not sent (${result.error}). The claim is still recorded. You can try again.`,
    );
  }
}

function feePhrase(basis: FeeBasis): string {
  return basis === "claim_type"
    ? "the contract term for this claim type"
    : "the driver's default contract fee";
}

export async function applyFee(store: Store, claimId: number): Promise<void> {
  const detail = await requireDetail(store, claimId);
  if (detail.status === "recorded") {
    throw new AppError("Send a warning before applying a fee.");
  }
  if (detail.status !== "warning_sent") {
    throw new AppError("A fee can only be applied once, after a warning has been sent.");
  }
  const typeFee = await typeFeeCents(store, detail.driverId, detail.claimTypeId);
  const driver = await getDriver(store, detail.driverId);
  if (!driver) throw new AppError("Choose a driver who is already on file.");
  const fee = contractFee(driver.defaultFeeCents, typeFee);
  const now = nowIso();
  const changed = await store.updateClaimIfStatus(claimId, "warning_sent", {
    status: "fee_applied",
    feeAmountCents: fee.amountCents,
    feeAppliedAt: now,
    feeBasis: fee.basis,
    updatedAt: now,
  });
  if (!changed) {
    throw new AppError("A fee can only be applied once, after a warning has been sent.");
  }
  await store.insertEvent({
    claimId,
    kind: "status_change",
    fromStatus: "warning_sent",
    toStatus: "fee_applied",
    message: `Fee of ${formatMoney(fee.amountCents)} applied from ${feePhrase(fee.basis)}. Status changed from Warning sent to Fee applied.`,
    emailId: null,
    createdAt: now,
  });
}

export function resolveClaim(store: Store, claimId: number, note = ""): Promise<void> {
  return closeClaim(store, claimId, "resolved", note);
}

export function waiveClaim(store: Store, claimId: number, note = ""): Promise<void> {
  return closeClaim(store, claimId, "waived", note);
}

async function closeClaim(
  store: Store,
  claimId: number,
  to: "resolved" | "waived",
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length > 500) throw new AppError("Keep the note under 500 characters.");
  const detail = await requireDetail(store, claimId);
  if (to === "resolved" && detail.status !== "fee_applied") {
    throw new AppError("Resolve a claim after the fee is applied. Waive it to close without a fee.");
  }
  if (to === "waived" && detail.status !== "recorded" && detail.status !== "warning_sent") {
    throw new AppError("Waive a claim only before a fee is applied.");
  }
  const from = detail.status;
  const now = nowIso();
  const changed = await store.updateClaimIfStatus(claimId, from, {
    status: to,
    updatedAt: now,
  });
  if (!changed) {
    throw new AppError("This claim changed. Reload and try again.");
  }
  const extra = trimmed ? ` Note: ${trimmed}` : "";
  await store.insertEvent({
    claimId,
    kind: "status_change",
    fromStatus: from,
    toStatus: to,
    message: `Status changed from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.${extra}`,
    emailId: null,
    createdAt: now,
  });
}

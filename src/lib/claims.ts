import type { DatabaseSync } from "node:sqlite";
import { getClaimType } from "./catalog";
import { changed, insertId, withTransaction } from "./db";
import { buildWarningEmail, type WarningEmail } from "./email-copy";
import { emailAuditMessage, type Mailer } from "./mailer";
import { AppError } from "./errors";
import { nowIso, parseIncidentDate } from "./format";
import { contractFee, getDriver, typeFeeCents } from "./drivers";
import { formatMoney } from "./money";
import { rowNumber, rowNumberOrNull, rowString, rowStringOrNull, type SqlRow } from "./rows";
import {
  STATUS_LABELS,
  isClaimSource,
  isClaimStatus,
  isEmailStatus,
  isEmailTransport,
  isEventKind,
  isFeeBasis,
  type ClaimDetail,
  type ClaimEventView,
  type ClaimFilter,
  type ClaimInput,
  type ClaimListItem,
  type DashboardStats,
  type EmailRecord,
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

const LIST_SQL = `
  SELECT
    c.id AS id,
    c.driver_id AS driver_id,
    d.name AS driver_name,
    c.claim_type_id AS claim_type_id,
    t.label AS claim_type_label,
    c.order_reference AS order_reference,
    c.occurred_at AS occurred_at,
    c.status AS status,
    c.source AS source,
    c.fee_amount_cents AS fee_amount_cents
  FROM claims c
  JOIN drivers d ON d.id = c.driver_id
  JOIN claim_types t ON t.id = c.claim_type_id
`;

function mapListItem(row: SqlRow): ClaimListItem {
  const status = rowString(row, "status");
  const source = rowString(row, "source");
  if (!isClaimStatus(status) || !isClaimSource(source)) {
    throw new Error("Claim row has an unexpected status or source.");
  }
  return {
    id: rowNumber(row, "id"),
    driverId: rowNumber(row, "driver_id"),
    driverName: rowString(row, "driver_name"),
    claimTypeId: rowNumber(row, "claim_type_id"),
    claimTypeLabel: rowString(row, "claim_type_label"),
    orderReference: rowStringOrNull(row, "order_reference"),
    occurredAt: rowString(row, "occurred_at"),
    status,
    source,
    feeAmountCents: rowNumberOrNull(row, "fee_amount_cents"),
  };
}

export function createClaim(db: DatabaseSync, input: ClaimInput): number {
  const driver = getDriver(db, input.driverId);
  if (!driver) throw new AppError("Choose a driver who is already on file.");
  const claimType = getClaimType(db, input.claimTypeId);
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
  const occurredAt = parseIncidentDate(input.occurredAt);

  return withTransaction(db, () => {
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO claims (
           driver_id, claim_type_id, order_reference, notes, occurred_at,
           status, source, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'recorded', 'manual', ?, ?)`,
      )
      .run(
        driver.id,
        claimType.id,
        orderReference,
        notes,
        occurredAt,
        now,
        now,
      );
    const id = insertId(result);
    db.prepare(
      `INSERT INTO claim_events (
         claim_id, kind, from_status, to_status, message, email_id, created_at
       ) VALUES (?, 'created', NULL, 'recorded', ?, NULL, ?)`,
    ).run(id, "Claim recorded by hand.", now);
    return id;
  });
}

export function listClaims(db: DatabaseSync, filter: ClaimFilter = {}): ClaimListItem[] {
  const where: string[] = [];
  const params: Array<number | string> = [];
  if (filter.driverId) {
    where.push("c.driver_id = ?");
    params.push(filter.driverId);
  }
  if (filter.claimTypeId) {
    where.push("c.claim_type_id = ?");
    params.push(filter.claimTypeId);
  }
  if (filter.status) {
    where.push("c.status = ?");
    params.push(filter.status);
  }
  if (filter.openOnly) {
    where.push("c.status IN ('recorded', 'warning_sent', 'fee_applied')");
  }
  const sql = `${LIST_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY c.occurred_at DESC, c.id DESC`;
  const rows = db.prepare(sql).all(...params) as SqlRow[];
  return rows.map(mapListItem);
}

export function dashboardStats(db: DatabaseSync): DashboardStats {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM claims GROUP BY status`)
    .all() as SqlRow[];
  const counts: DashboardStats = {
    open: 0,
    recorded: 0,
    warningSent: 0,
    feeApplied: 0,
    resolved: 0,
    waived: 0,
  };
  for (const row of rows) {
    const status = rowString(row, "status");
    const n = rowNumber(row, "n");
    if (status === "recorded") counts.recorded = n;
    else if (status === "warning_sent") counts.warningSent = n;
    else if (status === "fee_applied") counts.feeApplied = n;
    else if (status === "resolved") counts.resolved = n;
    else if (status === "waived") counts.waived = n;
  }
  counts.open = counts.recorded + counts.warningSent + counts.feeApplied;
  return counts;
}

function mapEvent(row: SqlRow): ClaimEventView {
  const kind = rowString(row, "kind");
  if (!isEventKind(kind)) throw new Error("Unexpected event kind.");
  const fromStatus = rowStringOrNull(row, "from_status");
  const toStatus = rowStringOrNull(row, "to_status");
  return {
    id: rowNumber(row, "id"),
    kind,
    fromStatus: fromStatus && isClaimStatus(fromStatus) ? fromStatus : null,
    toStatus: toStatus && isClaimStatus(toStatus) ? toStatus : null,
    message: rowString(row, "message"),
    emailId: rowNumberOrNull(row, "email_id"),
    createdAt: rowString(row, "created_at"),
  };
}

function mapEmail(row: SqlRow): EmailRecord {
  const transport = rowString(row, "transport");
  const status = rowString(row, "status");
  if (!isEmailTransport(transport) || !isEmailStatus(status)) {
    throw new Error("Unexpected email row.");
  }
  return {
    id: rowNumber(row, "id"),
    claimId: rowNumber(row, "claim_id"),
    driverId: rowNumber(row, "driver_id"),
    to: rowString(row, "to_address"),
    subject: rowString(row, "subject"),
    body: rowString(row, "body"),
    transport,
    status,
    error: rowStringOrNull(row, "error"),
    providerMessageId: rowStringOrNull(row, "provider_message_id"),
    createdAt: rowString(row, "created_at"),
    sentAt: rowStringOrNull(row, "sent_at"),
  };
}

export function getClaimDetail(db: DatabaseSync, id: number): ClaimDetail | undefined {
  const row = db
    .prepare(
      `SELECT
         c.id AS id,
         c.driver_id AS driver_id,
         d.name AS driver_name,
         d.email AS driver_email,
         d.default_fee_cents AS default_fee_cents,
         c.claim_type_id AS claim_type_id,
         t.label AS claim_type_label,
         t.description AS claim_type_description,
         c.order_reference AS order_reference,
         c.notes AS notes,
         c.occurred_at AS occurred_at,
         c.status AS status,
         c.source AS source,
         c.fee_amount_cents AS fee_amount_cents,
         c.fee_applied_at AS fee_applied_at,
         c.fee_basis AS fee_basis,
         c.created_at AS created_at,
         c.updated_at AS updated_at,
         f.amount_cents AS type_fee_cents
       FROM claims c
       JOIN drivers d ON d.id = c.driver_id
       JOIN claim_types t ON t.id = c.claim_type_id
       LEFT JOIN driver_fee_terms f
         ON f.driver_id = c.driver_id AND f.claim_type_id = c.claim_type_id
       WHERE c.id = ?`,
    )
    .get(id) as SqlRow | undefined;
  if (!row) return undefined;
  const status = rowString(row, "status");
  const source = rowString(row, "source");
  const feeBasisRaw = rowStringOrNull(row, "fee_basis");
  if (!isClaimStatus(status) || !isClaimSource(source)) {
    throw new Error("Claim row has an unexpected status or source.");
  }
  let feeBasis: FeeBasis | null = null;
  if (feeBasisRaw) {
    if (!isFeeBasis(feeBasisRaw)) {
      throw new Error("Claim row has an unexpected fee basis.");
    }
    feeBasis = feeBasisRaw;
  }
  const events = (
    db
      .prepare(
        `SELECT id, kind, from_status, to_status, message, email_id, created_at
         FROM claim_events
         WHERE claim_id = ?
         ORDER BY id ASC`,
      )
      .all(id) as SqlRow[]
  ).map(mapEvent);
  const emails = (
    db
      .prepare(
        `SELECT id, claim_id, driver_id, to_address, subject, body, transport, status, error,
                provider_message_id, created_at, sent_at
         FROM emails
         WHERE claim_id = ?
         ORDER BY id ASC`,
      )
      .all(id) as SqlRow[]
  ).map(mapEmail);
  const typeFee = rowNumberOrNull(row, "type_fee_cents");
  const fee = contractFee(rowNumber(row, "default_fee_cents"), typeFee);
  return {
    id: rowNumber(row, "id"),
    driverId: rowNumber(row, "driver_id"),
    driverName: rowString(row, "driver_name"),
    driverEmail: rowString(row, "driver_email"),
    claimTypeId: rowNumber(row, "claim_type_id"),
    claimTypeLabel: rowString(row, "claim_type_label"),
    claimTypeDescription: rowString(row, "claim_type_description"),
    orderReference: rowStringOrNull(row, "order_reference"),
    notes: rowString(row, "notes"),
    occurredAt: rowString(row, "occurred_at"),
    status,
    source,
    feeAmountCents: rowNumberOrNull(row, "fee_amount_cents"),
    feeAppliedAt: rowStringOrNull(row, "fee_applied_at"),
    feeBasis,
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
    contractFeeCents: fee.amountCents,
    contractFeeBasis: fee.basis,
    defaultFeeCents: rowNumber(row, "default_fee_cents"),
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

export function listRecentEmails(db: DatabaseSync, limit = 8): RecentEmail[] {
  const rows = db
    .prepare(
      `SELECT
         e.id AS id,
         e.claim_id AS claim_id,
         e.to_address AS to_address,
         e.subject AS subject,
         e.status AS status,
         e.transport AS transport,
         e.created_at AS created_at,
         e.error AS error,
         d.name AS driver_name
       FROM emails e
       JOIN drivers d ON d.id = e.driver_id
       ORDER BY e.id DESC
       LIMIT ?`,
    )
    .all(limit) as SqlRow[];
  return rows.map((row) => {
    const status = rowString(row, "status");
    const transport = rowString(row, "transport");
    if (!isEmailStatus(status) || !isEmailTransport(transport)) {
      throw new Error("Unexpected email row.");
    }
    return {
      id: rowNumber(row, "id"),
      claimId: rowNumber(row, "claim_id"),
      to: rowString(row, "to_address"),
      subject: rowString(row, "subject"),
      status,
      transport,
      createdAt: rowString(row, "created_at"),
      error: rowStringOrNull(row, "error"),
      driverName: rowString(row, "driver_name"),
    };
  });
}

function requireDetail(db: DatabaseSync, id: number): ClaimDetail {
  const detail = getClaimDetail(db, id);
  if (!detail) throw new AppError("Claim not found.");
  return detail;
}

export async function sendWarning(
  db: DatabaseSync,
  claimId: number,
  mailer: Mailer,
): Promise<void> {
  const detail = requireDetail(db, claimId);
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

  withTransaction(db, () => {
    const current = requireDetail(db, claimId);
    if (current.status !== "recorded") {
      throw new AppError(
        "This claim changed before the warning was recorded. Reload and try again.",
      );
    }
    const now = nowIso();
    const emailResult = db
      .prepare(
        `INSERT INTO emails (
           claim_id, driver_id, to_address, subject, body, transport, status, error,
           provider_message_id, created_at, sent_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        claimId,
        detail.driverId,
        email.to,
        email.subject,
        email.text,
        audit.transport,
        audit.status,
        audit.error,
        audit.providerMessageId,
        now,
        result.status === "sent" ? now : null,
      );
    const emailId = insertId(emailResult);
    db.prepare(
      `INSERT INTO claim_events (
         claim_id, kind, from_status, to_status, message, email_id, created_at
       ) VALUES (?, 'email', NULL, NULL, ?, ?, ?)`,
    ).run(claimId, audit.message, emailId, now);
    if (result.status !== "failed") {
      const update = db
        .prepare(
          `UPDATE claims
           SET status = 'warning_sent', updated_at = ?
           WHERE id = ? AND status = 'recorded'`,
        )
        .run(now, claimId);
      if (changed(update) !== 1) {
        throw new AppError(
          "This claim changed before the warning was recorded. Reload and try again.",
        );
      }
      db.prepare(
        `INSERT INTO claim_events (
           claim_id, kind, from_status, to_status, message, email_id, created_at
         ) VALUES (?, 'status_change', 'recorded', 'warning_sent', ?, NULL, ?)`,
      ).run(claimId, "Status changed from Recorded to Warning sent.", now);
    }
  });

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

export function applyFee(db: DatabaseSync, claimId: number): void {
  withTransaction(db, () => {
    const detail = requireDetail(db, claimId);
    if (detail.status === "recorded") {
      throw new AppError("Send a warning before applying a fee.");
    }
    if (detail.status !== "warning_sent") {
      throw new AppError("A fee can only be applied once, after a warning has been sent.");
    }
    const typeFee = typeFeeCents(db, detail.driverId, detail.claimTypeId);
    const driver = getDriver(db, detail.driverId);
    if (!driver) throw new AppError("Choose a driver who is already on file.");
    const fee = contractFee(driver.defaultFeeCents, typeFee);
    const now = nowIso();
    const update = db
      .prepare(
        `UPDATE claims
         SET status = 'fee_applied',
             fee_amount_cents = ?,
             fee_applied_at = ?,
             fee_basis = ?,
             updated_at = ?
         WHERE id = ? AND status = 'warning_sent'`,
      )
      .run(fee.amountCents, now, fee.basis, now, claimId);
    if (changed(update) !== 1) {
      throw new AppError("A fee can only be applied once, after a warning has been sent.");
    }
    db.prepare(
      `INSERT INTO claim_events (
         claim_id, kind, from_status, to_status, message, email_id, created_at
       ) VALUES (?, 'status_change', 'warning_sent', 'fee_applied', ?, NULL, ?)`,
    ).run(
      claimId,
      `Fee of ${formatMoney(fee.amountCents)} applied from ${feePhrase(fee.basis)}. Status changed from Warning sent to Fee applied.`,
      now,
    );
  });
}

export function resolveClaim(db: DatabaseSync, claimId: number, note = ""): void {
  closeClaim(db, claimId, "resolved", note);
}

export function waiveClaim(db: DatabaseSync, claimId: number, note = ""): void {
  closeClaim(db, claimId, "waived", note);
}

function closeClaim(
  db: DatabaseSync,
  claimId: number,
  to: "resolved" | "waived",
  note: string,
): void {
  const trimmed = note.trim();
  if (trimmed.length > 500) throw new AppError("Keep the note under 500 characters.");
  withTransaction(db, () => {
    const detail = requireDetail(db, claimId);
    if (to === "resolved" && detail.status !== "fee_applied") {
      throw new AppError(
        "Resolve a claim after the fee is applied. Waive it to close without a fee.",
      );
    }
    if (to === "waived" && detail.status !== "recorded" && detail.status !== "warning_sent") {
      throw new AppError("Waive a claim only before a fee is applied.");
    }
    const from = detail.status;
    const now = nowIso();
    const update = db
      .prepare(
        `UPDATE claims
         SET status = ?, updated_at = ?
         WHERE id = ? AND status = ?`,
      )
      .run(to, now, claimId, from);
    if (changed(update) !== 1) {
      throw new AppError("This claim changed. Reload and try again.");
    }
    const extra = trimmed ? ` Note: ${trimmed}` : "";
    const message = `Status changed from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.${extra}`;
    db.prepare(
      `INSERT INTO claim_events (
         claim_id, kind, from_status, to_status, message, email_id, created_at
       ) VALUES (?, 'status_change', ?, ?, ?, NULL, ?)`,
    ).run(claimId, from, to, message, now);
  });
}

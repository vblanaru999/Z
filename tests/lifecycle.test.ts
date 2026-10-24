import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync as Database } from "node:sqlite";
import { seedClaimTypes, listClaimTypes } from "../src/lib/catalog";
import {
  applyFee,
  createClaim,
  dashboardStats,
  getClaimDetail,
  listClaims,
  resolveClaim,
  sendWarning,
  waiveClaim,
  warningEmailForClaim,
} from "../src/lib/claims";
import { openDatabase } from "../src/lib/db";
import {
  createDriver,
  getDriver,
  listDriverFees,
  updateDriver,
} from "../src/lib/drivers";
import { buildWarningEmail } from "../src/lib/email-copy";
import { AppError } from "../src/lib/errors";
import { claimInputFromForm, driverInputFromForm } from "../src/lib/forms";
import { createMailer, type Mailer } from "../src/lib/mailer";
import { formatMoney } from "../src/lib/money";

let db: Database;

beforeEach(() => {
  db = openDatabase(":memory:");
});

function typeId(code: string): number {
  const type = listClaimTypes(db).find((item) => item.code === code);
  if (!type) throw new Error(`missing claim type ${code}`);
  return type.id;
}

function addDriver(options?: {
  email?: string;
  defaultFeeCents?: number;
  typeFees?: { claimTypeId: number; amountCents: number }[];
}): number {
  return createDriver(db, {
    name: "Maria Alvarez",
    email: options?.email ?? "maria.alvarez@example.com",
    defaultFeeCents: options?.defaultFeeCents ?? 2500,
    typeFees: options?.typeFees ?? [],
  });
}

function addClaim(driverId: number, claimTypeId: number, orderReference: string | null = "48219"): number {
  return createClaim(db, {
    driverId,
    claimTypeId,
    orderReference,
    notes: "The stop was finished, but the order was still open in the driver app.",
    occurredAt: "2026-10-23T20:10:00.000Z",
  });
}

const outbox = createMailer({});

describe("claim types", () => {
  it("seeds the three manual claim types and refreshes their labels", () => {
    const types = listClaimTypes(db);
    expect(types.map((type) => type.label)).toEqual([
      "Order not closed in the app",
      "Delivery label not scanned",
      "Poor or missing delivery photo attached to the order",
    ]);

    db.prepare(`UPDATE claim_types SET label = 'Nope' WHERE code = ?`).run("order_not_closed");
    seedClaimTypes(db);
    expect(listClaimTypes(db).find((type) => type.code === "order_not_closed")?.label).toBe(
      "Order not closed in the app",
    );
  });
});

describe("drivers", () => {
  it("stores a default fee and an optional fee per claim type", () => {
    const photoId = typeId("poor_delivery_photo");
    const id = addDriver({
      typeFees: [{ claimTypeId: photoId, amountCents: 4000 }],
    });
    const driver = getDriver(db, id);
    expect(driver?.defaultFeeCents).toBe(2500);
    expect(listDriverFees(db, id)).toEqual([
      {
        claimTypeId: photoId,
        claimTypeLabel: "Poor or missing delivery photo attached to the order",
        amountCents: 4000,
      },
    ]);

    updateDriver(db, id, {
      name: "Maria Alvarez",
      email: "maria.alvarez@example.com",
      defaultFeeCents: 3000,
      typeFees: [],
    });
    expect(getDriver(db, id)?.defaultFeeCents).toBe(3000);
    expect(listDriverFees(db, id)).toEqual([]);
  });

  it("rejects a missing name, a bad email, and a messy fee", () => {
    expect(() =>
      createDriver(db, {
        name: "  ",
        email: "maria.alvarez@example.com",
        defaultFeeCents: 100,
        typeFees: [],
      }),
    ).toThrow(/name/);
    expect(() =>
      createDriver(db, {
        name: "Maria Alvarez",
        email: "not-an-email",
        defaultFeeCents: 100,
        typeFees: [],
      }),
    ).toThrow(AppError);
  });

  it("reads contract amounts from the driver form", () => {
    const photoId = typeId("poor_delivery_photo");
    const form = new FormData();
    form.set("name", "Ada Lovelace");
    form.set("email", "ada@example.com");
    form.set("defaultFee", "$25.50");
    form.set(`typeFee_${photoId}`, "40");
    form.set(`typeFee_${typeId("label_not_scanned")}`, "   ");
    const input = driverInputFromForm(form, listClaimTypes(db));
    expect(input.defaultFeeCents).toBe(2550);
    expect(input.typeFees).toEqual([{ claimTypeId: photoId, amountCents: 4000 }]);
  });
});

describe("lifecycle", () => {
  it("runs the manual path from recorded through a warning, a fee, and resolved", async () => {
    const photoId = typeId("poor_delivery_photo");
    const driverId = addDriver({
      typeFees: [{ claimTypeId: photoId, amountCents: 4000 }],
    });
    const claimId = addClaim(driverId, photoId, "48219");

    let detail = getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.source).toBe("manual");
    expect(detail?.emails).toHaveLength(0);
    expect(detail?.events.map((event) => event.kind)).toEqual(["created"]);
    expect(detail?.events[0]?.message).toBe("Claim recorded by hand.");

    await expect(Promise.resolve().then(() => applyFee(db, claimId))).rejects.toThrow(
      /Send a warning/,
    );

    await sendWarning(db, claimId, outbox);
    detail = getClaimDetail(db, claimId);
    expect(detail?.status).toBe("warning_sent");
    expect(detail?.emails).toHaveLength(1);
    expect(detail?.emails[0]).toMatchObject({
      to: "maria.alvarez@example.com",
      transport: "outbox",
      status: "saved",
      subject: "Warning: Poor or missing delivery photo attached to the order",
    });
    const body = detail?.emails[0]?.body ?? "";
    expect(body).toContain("Maria Alvarez");
    expect(body).toContain("Poor or missing delivery photo attached to the order");
    expect(body).toContain("Order reference: 48219");
    expect(body).toContain("formal warning");
    expect(body).toContain("Repeated issues can incur the fee");
    expect(body).toContain(formatMoney(4000));
    expect(body).toBe(warningEmailForClaim(detail!).text);
    expect(detail?.events.map((event) => event.kind)).toEqual([
      "created",
      "email",
      "status_change",
    ]);

    applyFee(db, claimId);
    detail = getClaimDetail(db, claimId);
    expect(detail).toMatchObject({
      status: "fee_applied",
      feeAmountCents: 4000,
      feeBasis: "claim_type",
    });
    expect(detail?.feeAppliedAt).toBeTruthy();
    expect(detail?.events.at(-1)?.message).toContain("contract term for this claim type");

    updateDriver(db, driverId, {
      name: "Maria Alvarez",
      email: "maria.alvarez@example.com",
      defaultFeeCents: 9999,
      typeFees: [{ claimTypeId: photoId, amountCents: 1 }],
    });
    expect(getClaimDetail(db, claimId)?.feeAmountCents).toBe(4000);

    resolveClaim(db, claimId, "Fee recorded with payroll.");
    detail = getClaimDetail(db, claimId);
    expect(detail?.status).toBe("resolved");
    expect(detail?.events.at(-1)?.message).toContain("Fee recorded with payroll.");
    expect(dashboardStats(db).open).toBe(0);
    expect(listClaims(db, { openOnly: true })).toHaveLength(0);

    await expect(sendWarning(db, claimId, outbox)).rejects.toThrow(/recorded/);
    expect(() => applyFee(db, claimId)).toThrow(/only be applied once/);
    expect(() => waiveClaim(db, claimId)).toThrow(/before a fee/);
  });

  it("uses the default contract fee when the claim type has no override", async () => {
    const driverId = addDriver({ defaultFeeCents: 2000 });
    const claimId = addClaim(driverId, typeId("label_not_scanned"));
    await sendWarning(db, claimId, outbox);
    applyFee(db, claimId);
    const detail = getClaimDetail(db, claimId);
    expect(detail).toMatchObject({ feeAmountCents: 2000, feeBasis: "default" });
    expect(detail?.events.at(-1)?.message).toContain("default contract fee");
  });

  it("can waive before a fee, and does not email when a claim is only recorded", async () => {
    const driverId = addDriver();
    const recordedId = addClaim(driverId, typeId("order_not_closed"), null);
    expect(getClaimDetail(db, recordedId)?.emails).toHaveLength(0);
    const preview = warningEmailForClaim(getClaimDetail(db, recordedId)!);
    expect(preview.text).not.toContain("Order reference");
    expect(preview.text).toContain("What went wrong:");

    waiveClaim(db, recordedId, "Entered on the wrong driver.");
    expect(getClaimDetail(db, recordedId)?.status).toBe("waived");
    await expect(sendWarning(db, recordedId, outbox)).rejects.toThrow(/recorded/);

    const warnedId = addClaim(driverId, typeId("label_not_scanned"), "10910");
    await sendWarning(db, warnedId, outbox);
    waiveClaim(db, warnedId);
    expect(getClaimDetail(db, warnedId)?.status).toBe("waived");
    expect(() => resolveClaim(db, warnedId)).toThrow(/after the fee/);
  });

  it("keeps the claim recorded when SMTP fails and stores the attempt", async () => {
    const driverId = addDriver();
    const claimId = addClaim(driverId, typeId("order_not_closed"));
    const failing: Mailer = {
      async send() {
        return { transport: "smtp", status: "failed", error: "connection refused" };
      },
    };
    await expect(sendWarning(db, claimId, failing)).rejects.toThrow(/connection refused/);
    const detail = getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.emails[0]).toMatchObject({
      status: "failed",
      transport: "smtp",
      error: "connection refused",
    });
    expect(detail?.events.some((event) => event.kind === "status_change")).toBe(false);
  });

  it("does not record a warning when SMTP settings are incomplete", async () => {
    const driverId = addDriver();
    const claimId = addClaim(driverId, typeId("order_not_closed"));
    const mailer = createMailer({ SMTP_HOST: "smtp.example.com" });
    await expect(sendWarning(db, claimId, mailer)).rejects.toThrow(/partly configured/);
    const detail = getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.emails).toHaveLength(0);
  });

  it("stores the SMTP2GO email id when the API accepts the warning", async () => {
    const driverId = addDriver();
    const claimId = addClaim(driverId, typeId("order_not_closed"));
    const mailer = createMailer(
      {
        SMTP2GO_API_KEY: "test-key",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_FROM: "ops@example.com",
      },
      {
        deliverSmtp: async () => {
          throw new Error("SMTP should not be used when SMTP2GO is configured");
        },
        sendSmtp2Go: async (request) => {
          expect(request.sender).toBe("claim@bogdandelivery.com");
          expect(request.to).toEqual(["maria.alvarez@example.com"]);
          expect(request.apiKey).toBe("test-key");
          return { emailId: "smtp2go-email-1" };
        },
      },
    );
    await sendWarning(db, claimId, mailer);
    const detail = getClaimDetail(db, claimId);
    expect(detail?.status).toBe("warning_sent");
    expect(detail?.emails[0]).toMatchObject({
      transport: "smtp2go",
      status: "sent",
      providerMessageId: "smtp2go-email-1",
    });
    expect(detail?.events.map((event) => event.message).join("\n")).toContain("smtp2go-email-1");
  });

  it("does not mark the warning sent when SMTP2GO rejects the message", async () => {
    const driverId = addDriver({ email: "ada@example.com" });
    const claimId = addClaim(driverId, typeId("label_not_scanned"), "55");
    const mailer = createMailer(
      { SMTP2GO_API_KEY: "test-key" },
      {
        sendSmtp2Go: async () => {
          throw new Error("SMTP2GO 400: The from address is not a verified sender");
        },
      },
    );
    await expect(sendWarning(db, claimId, mailer)).rejects.toThrow(/not a verified sender/);
    const detail = getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.emails[0]).toMatchObject({
      transport: "smtp2go",
      status: "failed",
    });
    expect(detail?.emails[0]?.error).toContain("not a verified sender");
    expect(detail?.events.some((event) => event.kind === "status_change")).toBe(false);
  });

  it("marks the warning sent when SMTP delivery succeeds", async () => {
    const driverId = addDriver();
    const claimId = addClaim(driverId, typeId("order_not_closed"));
    const sent: Mailer = {
      async send() {
        return { transport: "smtp", status: "sent" };
      },
    };
    await sendWarning(db, claimId, sent);
    expect(getClaimDetail(db, claimId)?.emails[0]).toMatchObject({
      status: "sent",
      transport: "smtp",
    });
    expect(getClaimDetail(db, claimId)?.status).toBe("warning_sent");
  });

  it("filters claims by driver, type, and status", async () => {
    const maria = addDriver();
    const james = addDriver({
      email: "james.okonkwo@example.com",
      defaultFeeCents: 1500,
    });
    const closed = typeId("order_not_closed");
    const label = typeId("label_not_scanned");
    const mariaClaim = addClaim(maria, closed, "1");
    const jamesClaim = addClaim(james, label, "2");
    await sendWarning(db, jamesClaim, outbox);

    expect(listClaims(db, { driverId: maria }).map((claim) => claim.id)).toEqual([mariaClaim]);
    expect(listClaims(db, { claimTypeId: label }).map((claim) => claim.id)).toEqual([jamesClaim]);
    expect(listClaims(db, { status: "warning_sent" }).map((claim) => claim.id)).toEqual([
      jamesClaim,
    ]);
    expect(listClaims(db, { driverId: maria, status: "warning_sent" })).toHaveLength(0);

    const stats = dashboardStats(db);
    expect(stats).toMatchObject({ open: 2, recorded: 1, warningSent: 1, feeApplied: 0 });
    expect(listClaims(db, { openOnly: true })).toHaveLength(2);
  });

  it("reserves xcelerator as a source without writing it from manual entry", () => {
    const driverId = addDriver();
    const claimTypeId = typeId("order_not_closed");
    const manualId = addClaim(driverId, claimTypeId);
    expect(getClaimDetail(db, manualId)?.source).toBe("manual");

    const now = "2026-10-24T12:00:00.000Z";
    const inserted = db
      .prepare(
        `INSERT INTO claims (
           driver_id, claim_type_id, notes, occurred_at, status, source, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'recorded', 'xcelerator', ?, ?)`,
      )
      .run(driverId, claimTypeId, "Imported later.", now, now, now);
    const reservedId = Number(inserted.lastInsertRowid);
    expect(getClaimDetail(db, reservedId)?.source).toBe("xcelerator");

    expect(() =>
      db
        .prepare(
          `INSERT INTO claims (
             driver_id, claim_type_id, notes, occurred_at, status, source, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'recorded', 'other', ?, ?)`,
        )
        .run(driverId, claimTypeId, "No.", now, now, now),
    ).toThrow();
  });

  it("parses a claim form into a manual claim", () => {
    const driverId = addDriver();
    const form = new FormData();
    form.set("driverId", String(driverId));
    form.set("claimTypeId", String(typeId("order_not_closed")));
    form.set("orderReference", "  ");
    form.set("notes", "Left the order open.");
    form.set("occurredAt", "2026-10-24T09:30");
    const input = claimInputFromForm(form);
    expect(input.orderReference).toBeNull();
    expect(input.notes).toBe("Left the order open.");
    const id = createClaim(db, input);
    expect(getClaimDetail(db, id)?.source).toBe("manual");
    expect(getClaimDetail(db, id)?.orderReference).toBeNull();
  });
});

describe("warning copy", () => {
  it("names the failure, the order, and that a contract fee can follow", () => {
    const email = buildWarningEmail({
      claimId: 12,
      driverName: "James Okonkwo",
      driverEmail: "james@example.com",
      claimTypeLabel: "Delivery label not scanned",
      occurredAt: "2026-10-23T20:10:00.000Z",
      orderReference: "10910",
      notes: "The label was still in the cab.",
      feeAmountCents: 2000,
      feeBasis: "default",
      defaultFeeCents: 2000,
    });
    expect(email.to).toBe("james@example.com");
    expect(email.subject).toBe("Warning: Delivery label not scanned");
    expect(email.text).toContain("James Okonkwo");
    expect(email.text).toContain("Delivery label not scanned");
    expect(email.text).toContain("Order reference: 10910");
    expect(email.text).toContain("The label was still in the cab.");
    expect(email.text).toContain("formal warning");
    expect(email.text).toContain("does not apply a fee");
    expect(email.text).toContain("$20.00");
    expect(email.text).toContain("claim 12");
  });
});

describe("email table migration", () => {
  it("keeps existing outbox rows and allows an SMTP2GO id", () => {
    const file = path.join(
      os.tmpdir(),
      `claim-emails-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
    );
    const initial = new DatabaseSync(file);
    initial.exec(`
      CREATE TABLE emails (
        id INTEGER PRIMARY KEY,
        claim_id INTEGER NOT NULL,
        driver_id INTEGER NOT NULL,
        to_address TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        transport TEXT NOT NULL CHECK (transport IN ('outbox', 'smtp')),
        status TEXT NOT NULL CHECK (status IN ('saved', 'sent', 'failed')),
        error TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT
      );
      INSERT INTO emails (
        claim_id, driver_id, to_address, subject, body, transport, status, created_at
      ) VALUES (
        1, 1, 'a@b.co', 'Hi', 'Body', 'outbox', 'saved', '2026-10-24T00:00:00.000Z'
      );
    `);
    initial.close();

    const upgraded = openDatabase(file);
    const definition = upgraded
      .prepare(`SELECT sql FROM sqlite_master WHERE name = 'emails'`)
      .get() as { sql: string };
    expect(definition.sql).toContain("smtp2go");
    expect(definition.sql).toContain("provider_message_id");
    const kept = upgraded
      .prepare(`SELECT transport, provider_message_id FROM emails WHERE id = 1`)
      .get() as { transport: string; provider_message_id: string | null };
    expect(kept).toEqual({ transport: "outbox", provider_message_id: null });
    upgraded.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(file + suffix, { force: true });
    }
  });
});

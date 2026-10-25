import { beforeEach, describe, expect, it } from "vitest";
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
import { createMemoryStore, type MemoryStore } from "../src/lib/memory-store";
import { formatMoney } from "../src/lib/money";

let db: MemoryStore;

beforeEach(async () => {
  db = createMemoryStore();
  await db.seedClaimTypes();
});

async function typeId(code: string): Promise<number> {
  const type = (await listClaimTypes(db)).find((item) => item.code === code);
  if (!type) throw new Error(`missing claim type ${code}`);
  return type.id;
}

async function addDriver(options?: {
  email?: string;
  defaultFeeCents?: number;
  typeFees?: { claimTypeId: number; amountCents: number }[];
}): Promise<number> {
  return createDriver(db, {
    name: "Maria Alvarez",
    email: options?.email ?? "maria.alvarez@example.com",
    defaultFeeCents: options?.defaultFeeCents ?? 2500,
    typeFees: options?.typeFees ?? [],
  });
}

async function addClaim(
  driverId: number,
  claimTypeId: number,
  orderReference: string | null = "48219",
): Promise<number> {
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
  it("seeds the three manual claim types and refreshes their labels", async () => {
    const types = await listClaimTypes(db);
    expect(types.map((type) => type.label)).toEqual([
      "Order not closed in the app",
      "Delivery label not scanned",
      "Poor or missing delivery photo attached to the order",
    ]);

    await db.renameClaimType("order_not_closed", "Nope");
    await seedClaimTypes(db);
    expect((await listClaimTypes(db)).find((type) => type.code === "order_not_closed")?.label).toBe(
      "Order not closed in the app",
    );
  });
});

describe("drivers", () => {
  it("stores a default fee and an optional fee per claim type", async () => {
    const photoId = await typeId("poor_delivery_photo");
    const id = await addDriver({
      typeFees: [{ claimTypeId: photoId, amountCents: 4000 }],
    });
    const driver = await getDriver(db, id);
    expect(driver?.defaultFeeCents).toBe(2500);
    expect(await listDriverFees(db, id)).toEqual([
      {
        claimTypeId: photoId,
        claimTypeLabel: "Poor or missing delivery photo attached to the order",
        amountCents: 4000,
      },
    ]);

    await updateDriver(db, id, {
      name: "Maria Alvarez",
      email: "maria.alvarez@example.com",
      defaultFeeCents: 3000,
      typeFees: [],
    });
    expect((await getDriver(db, id))?.defaultFeeCents).toBe(3000);
    expect(await listDriverFees(db, id)).toEqual([]);
  });

  it("rejects a missing name, a bad email, and a messy fee", async () => {
    await expect(
      createDriver(db, {
        name: "  ",
        email: "maria.alvarez@example.com",
        defaultFeeCents: 100,
        typeFees: [],
      }),
    ).rejects.toThrow(/name/);
    await expect(
      createDriver(db, {
        name: "Maria Alvarez",
        email: "not-an-email",
        defaultFeeCents: 100,
        typeFees: [],
      }),
    ).rejects.toThrow(AppError);
  });

  it("reads contract amounts from the driver form", async () => {
    const photoId = await typeId("poor_delivery_photo");
    const form = new FormData();
    form.set("name", "Ada Lovelace");
    form.set("email", "ada@example.com");
    form.set("defaultFee", "$25.50");
    form.set(`typeFee_${photoId}`, "40");
    form.set(`typeFee_${await typeId("label_not_scanned")}`, "   ");
    const input = driverInputFromForm(form, await listClaimTypes(db));
    expect(input.defaultFeeCents).toBe(2550);
    expect(input.typeFees).toEqual([{ claimTypeId: photoId, amountCents: 4000 }]);
  });
});

describe("lifecycle", () => {
  it("runs the manual path from recorded through a warning, a fee, and resolved", async () => {
    const photoId = await typeId("poor_delivery_photo");
    const driverId = await addDriver({
      typeFees: [{ claimTypeId: photoId, amountCents: 4000 }],
    });
    const claimId = await addClaim(driverId, photoId, "48219");

    let detail = await getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.source).toBe("manual");
    expect(detail?.emails).toHaveLength(0);
    expect(detail?.events.map((event) => event.kind)).toEqual(["created"]);
    expect(detail?.events[0]?.message).toBe("Claim recorded by hand.");
    expect(detail?.occurredAt).toMatch(/T\d{2}:\d{2}/);

    await expect(applyFee(db, claimId)).rejects.toThrow(/Send a warning/);

    await sendWarning(db, claimId, outbox);
    detail = await getClaimDetail(db, claimId);
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

    await applyFee(db, claimId);
    detail = await getClaimDetail(db, claimId);
    expect(detail).toMatchObject({
      status: "fee_applied",
      feeAmountCents: 4000,
      feeBasis: "claim_type",
    });
    expect(detail?.feeAppliedAt).toBeTruthy();
    expect(detail?.events.at(-1)?.message).toContain("contract term for this claim type");

    await updateDriver(db, driverId, {
      name: "Maria Alvarez",
      email: "maria.alvarez@example.com",
      defaultFeeCents: 9999,
      typeFees: [{ claimTypeId: photoId, amountCents: 1 }],
    });
    expect((await getClaimDetail(db, claimId))?.feeAmountCents).toBe(4000);

    await resolveClaim(db, claimId, "Fee recorded with payroll.");
    detail = await getClaimDetail(db, claimId);
    expect(detail?.status).toBe("resolved");
    expect(detail?.events.at(-1)?.message).toContain("Fee recorded with payroll.");
    expect((await dashboardStats(db)).open).toBe(0);
    expect(await listClaims(db, { openOnly: true })).toHaveLength(0);

    await expect(sendWarning(db, claimId, outbox)).rejects.toThrow(/recorded/);
    await expect(applyFee(db, claimId)).rejects.toThrow(/only be applied once/);
    await expect(waiveClaim(db, claimId)).rejects.toThrow(/before a fee/);
  });

  it("uses the default contract fee when the claim type has no override", async () => {
    const driverId = await addDriver({ defaultFeeCents: 2000 });
    const claimId = await addClaim(driverId, await typeId("label_not_scanned"));
    await sendWarning(db, claimId, outbox);
    await applyFee(db, claimId);
    const detail = await getClaimDetail(db, claimId);
    expect(detail).toMatchObject({ feeAmountCents: 2000, feeBasis: "default" });
    expect(detail?.events.at(-1)?.message).toContain("default contract fee");
  });

  it("can waive before a fee, and does not email when a claim is only recorded", async () => {
    const driverId = await addDriver();
    const recordedId = await addClaim(driverId, await typeId("order_not_closed"), null);
    expect((await getClaimDetail(db, recordedId))?.emails).toHaveLength(0);
    const preview = warningEmailForClaim((await getClaimDetail(db, recordedId))!);
    expect(preview.text).not.toContain("Order reference");
    expect(preview.text).toContain("What went wrong:");

    await waiveClaim(db, recordedId, "Entered on the wrong driver.");
    expect((await getClaimDetail(db, recordedId))?.status).toBe("waived");
    await expect(sendWarning(db, recordedId, outbox)).rejects.toThrow(/recorded/);

    const warnedId = await addClaim(driverId, await typeId("label_not_scanned"), "10910");
    await sendWarning(db, warnedId, outbox);
    await waiveClaim(db, warnedId);
    expect((await getClaimDetail(db, warnedId))?.status).toBe("waived");
    await expect(resolveClaim(db, warnedId)).rejects.toThrow(/after the fee/);
  });

  it("keeps the claim recorded when SMTP fails and stores the attempt", async () => {
    const driverId = await addDriver();
    const claimId = await addClaim(driverId, await typeId("order_not_closed"));
    const failing: Mailer = {
      async send() {
        return { transport: "smtp", status: "failed", error: "connection refused" };
      },
    };
    await expect(sendWarning(db, claimId, failing)).rejects.toThrow(/connection refused/);
    const detail = await getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.emails[0]).toMatchObject({
      status: "failed",
      transport: "smtp",
      error: "connection refused",
    });
    expect(detail?.events.some((event) => event.kind === "status_change")).toBe(false);
  });

  it("does not record a warning when SMTP settings are incomplete", async () => {
    const driverId = await addDriver();
    const claimId = await addClaim(driverId, await typeId("order_not_closed"));
    const mailer = createMailer({ SMTP_HOST: "smtp.example.com" });
    await expect(sendWarning(db, claimId, mailer)).rejects.toThrow(/partly configured/);
    const detail = await getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.emails).toHaveLength(0);
  });

  it("stores the SMTP2GO email id when the API accepts the warning", async () => {
    const driverId = await addDriver();
    const claimId = await addClaim(driverId, await typeId("order_not_closed"));
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
    const detail = await getClaimDetail(db, claimId);
    expect(detail?.status).toBe("warning_sent");
    expect(detail?.emails[0]).toMatchObject({
      transport: "smtp2go",
      status: "sent",
      providerMessageId: "smtp2go-email-1",
    });
    expect(detail?.events.map((event) => event.message).join("\n")).toContain("smtp2go-email-1");
  });

  it("does not mark the warning sent when SMTP2GO rejects the message", async () => {
    const driverId = await addDriver({ email: "ada@example.com" });
    const claimId = await addClaim(driverId, await typeId("label_not_scanned"), "55");
    const mailer = createMailer(
      { SMTP2GO_API_KEY: "test-key" },
      {
        sendSmtp2Go: async () => {
          throw new Error("SMTP2GO 400: The from address is not a verified sender");
        },
      },
    );
    await expect(sendWarning(db, claimId, mailer)).rejects.toThrow(/not a verified sender/);
    const detail = await getClaimDetail(db, claimId);
    expect(detail?.status).toBe("recorded");
    expect(detail?.emails[0]).toMatchObject({
      transport: "smtp2go",
      status: "failed",
    });
    expect(detail?.emails[0]?.error).toContain("not a verified sender");
    expect(detail?.events.some((event) => event.kind === "status_change")).toBe(false);
  });

  it("marks the warning sent when SMTP delivery succeeds", async () => {
    const driverId = await addDriver();
    const claimId = await addClaim(driverId, await typeId("order_not_closed"));
    const sent: Mailer = {
      async send() {
        return { transport: "smtp", status: "sent" };
      },
    };
    await sendWarning(db, claimId, sent);
    expect((await getClaimDetail(db, claimId))?.emails[0]).toMatchObject({
      status: "sent",
      transport: "smtp",
    });
    expect((await getClaimDetail(db, claimId))?.status).toBe("warning_sent");
  });

  it("filters claims by driver, type, and status", async () => {
    const maria = await addDriver();
    const james = await addDriver({
      email: "james.okonkwo@example.com",
      defaultFeeCents: 1500,
    });
    const closed = await typeId("order_not_closed");
    const label = await typeId("label_not_scanned");
    const mariaClaim = await addClaim(maria, closed, "1");
    const jamesClaim = await addClaim(james, label, "2");
    await sendWarning(db, jamesClaim, outbox);

    expect((await listClaims(db, { driverId: maria })).map((claim) => claim.id)).toEqual([mariaClaim]);
    expect((await listClaims(db, { claimTypeId: label })).map((claim) => claim.id)).toEqual([jamesClaim]);
    expect((await listClaims(db, { status: "warning_sent" })).map((claim) => claim.id)).toEqual([
      jamesClaim,
    ]);
    expect(await listClaims(db, { driverId: maria, status: "warning_sent" })).toHaveLength(0);

    const stats = await dashboardStats(db);
    expect(stats).toMatchObject({ open: 2, recorded: 1, warningSent: 1, feeApplied: 0 });
    expect(await listClaims(db, { openOnly: true })).toHaveLength(2);
  });

  it("reserves xcelerator as a source without writing it from manual entry", async () => {
    const driverId = await addDriver();
    const claimTypeId = await typeId("order_not_closed");
    const manualId = await addClaim(driverId, claimTypeId);
    expect((await getClaimDetail(db, manualId))?.source).toBe("manual");

    const now = "2026-10-24T12:00:00.000Z";
    const reservedId = await db.insertClaimWithSource({
      driverId,
      claimTypeId,
      orderReference: null,
      notes: "Imported later.",
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      source: "xcelerator",
    });
    expect((await getClaimDetail(db, reservedId))?.source).toBe("xcelerator");

    await expect(
      db.insertClaimWithSource({
        driverId,
        claimTypeId,
        orderReference: null,
        notes: "No.",
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        source: "other",
      }),
    ).rejects.toThrow(/source/);
  });

  it("parses a claim form into a manual claim with a date and time", async () => {
    const driverId = await addDriver();
    const form = new FormData();
    form.set("driverId", String(driverId));
    form.set("claimTypeId", String(await typeId("order_not_closed")));
    form.set("orderReference", "  ");
    form.set("notes", "Left the order open.");
    form.set("occurredAt", "2026-10-24T09:30");
    const input = claimInputFromForm(form);
    expect(input.orderReference).toBeNull();
    expect(input.notes).toBe("Left the order open.");
    const id = await createClaim(db, input);
    const saved = await getClaimDetail(db, id);
    expect(saved?.source).toBe("manual");
    expect(saved?.orderReference).toBeNull();
    expect(saved?.occurredAt).toMatch(/T\d{2}:\d{2}/);
    expect(saved?.occurredAt).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
    expect(email.text).toMatch(/When: .+\d:\d{2}/);
  });
});

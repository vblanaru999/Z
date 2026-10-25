import { CLAIM_TYPE_SEEDS } from "./catalog";
import type {
  ClaimEventView,
  ClaimFilter,
  ClaimListItem,
  ClaimSource,
  ClaimStatus,
  ClaimType,
  Driver,
  DriverFee,
  DriverListItem,
  EmailRecord,
  RecentEmail,
} from "./types";
import {
  isClaimSource,
  isEmailStatus,
  isEmailTransport,
  isEventKind,
  OPEN_STATUSES,
} from "./types";
import type {
  ClaimInsert,
  ClaimRecord,
  ClaimStatusPatch,
  DriverRowInput,
  DriverRowPatch,
  EmailInsert,
  EventInsert,
  Store,
} from "./store";

type FeeRow = { driverId: number; claimTypeId: number; amountCents: number };
type ClaimRow = {
  id: number;
  driverId: number;
  claimTypeId: number;
  orderReference: string | null;
  notes: string;
  occurredAt: string;
  status: ClaimStatus;
  source: ClaimSource;
  feeAmountCents: number | null;
  feeAppliedAt: string | null;
  feeBasis: ClaimRecord["feeBasis"];
  createdAt: string;
  updatedAt: string;
};
type EmailRow = EmailRecord;
type EventRow = ClaimEventView & { claimId: number };

export type MemoryStore = Store & {
  renameClaimType(code: string, label: string): Promise<void>;
  insertClaimWithSource(row: ClaimInsert & { source: string; notes: string }): Promise<number>;
};

function compareNames(a: Driver, b: Driver): number {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id - b.id;
}

export function createMemoryStore(): MemoryStore {
  const claimTypes: ClaimType[] = [];
  const drivers: Driver[] = [];
  const fees: FeeRow[] = [];
  const claims: ClaimRow[] = [];
  const emails: EmailRow[] = [];
  const events: EventRow[] = [];
  let nextType = 1;
  let nextDriver = 1;
  let nextClaim = 1;
  let nextEmail = 1;
  let nextEvent = 1;

  function feesFor(driverId: number): DriverFee[] {
    return fees
      .filter((fee) => fee.driverId === driverId)
      .sort((a, b) => a.claimTypeId - b.claimTypeId)
      .map((fee) => ({
        claimTypeId: fee.claimTypeId,
        claimTypeLabel: claimTypes.find((type) => type.id === fee.claimTypeId)?.label ?? "",
        amountCents: fee.amountCents,
      }));
  }

  function toListItem(claim: ClaimRow): ClaimListItem {
    const driver = drivers.find((item) => item.id === claim.driverId);
    const type = claimTypes.find((item) => item.id === claim.claimTypeId);
    if (!driver || !type) throw new Error("Claim row is missing its driver or type.");
    return {
      id: claim.id,
      driverId: claim.driverId,
      driverName: driver.name,
      claimTypeId: claim.claimTypeId,
      claimTypeLabel: type.label,
      orderReference: claim.orderReference,
      occurredAt: claim.occurredAt,
      status: claim.status,
      source: claim.source,
      feeAmountCents: claim.feeAmountCents,
    };
  }

  const store: MemoryStore = {
    async seedClaimTypes() {
      for (const seed of CLAIM_TYPE_SEEDS) {
        const existing = claimTypes.find((type) => type.code === seed.code);
        if (existing) {
          existing.label = seed.label;
          existing.description = seed.description;
        } else {
          claimTypes.push({
            id: nextType,
            code: seed.code,
            label: seed.label,
            description: seed.description,
          });
          nextType += 1;
        }
      }
      claimTypes.sort((a, b) => a.id - b.id);
    },

    async listClaimTypes() {
      return claimTypes.map((type) => ({ ...type }));
    },

    async getClaimType(id) {
      const type = claimTypes.find((item) => item.id === id);
      return type ? { ...type } : undefined;
    },

    async renameClaimType(code, label) {
      const type = claimTypes.find((item) => item.code === code);
      if (!type) throw new Error(`missing claim type ${code}`);
      type.label = label;
    },

    async insertDriver(row: DriverRowInput) {
      const id = nextDriver;
      nextDriver += 1;
      drivers.push({
        id,
        name: row.name,
        email: row.email,
        defaultFeeCents: row.defaultFeeCents,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      return id;
    },

    async updateDriverRow(id, row: DriverRowPatch) {
      const driver = drivers.find((item) => item.id === id);
      if (!driver) throw new Error("Driver not found.");
      driver.name = row.name;
      driver.email = row.email;
      driver.defaultFeeCents = row.defaultFeeCents;
      driver.updatedAt = row.updatedAt;
    },

    async replaceDriverFees(driverId, next) {
      for (let index = fees.length - 1; index >= 0; index -= 1) {
        if (fees[index].driverId === driverId) fees.splice(index, 1);
      }
      for (const fee of next) {
        fees.push({ driverId, claimTypeId: fee.claimTypeId, amountCents: fee.amountCents });
      }
    },

    async getDriver(id) {
      const driver = drivers.find((item) => item.id === id);
      return driver ? { ...driver } : undefined;
    },

    async getDriverByEmail(email) {
      const driver = drivers.find((item) => item.email === email);
      return driver ? { ...driver } : undefined;
    },

    async listDrivers(): Promise<DriverListItem[]> {
      return drivers
        .slice()
        .sort(compareNames)
        .map((driver) => ({ ...driver, typeFees: feesFor(driver.id) }));
    },

    async listDriverFees(driverId) {
      return feesFor(driverId);
    },

    async typeFeeCents(driverId, claimTypeId) {
      const fee = fees.find((item) => item.driverId === driverId && item.claimTypeId === claimTypeId);
      return fee ? fee.amountCents : null;
    },

    async insertClaim(row) {
      return store.insertClaimWithSource({ ...row, source: "manual" });
    },

    async insertClaimWithSource(row) {
      if (!isClaimSource(row.source)) {
        throw new Error(`invalid claim source ${row.source}`);
      }
      if (!drivers.some((driver) => driver.id === row.driverId)) {
        throw new Error("missing driver");
      }
      if (!claimTypes.some((type) => type.id === row.claimTypeId)) {
        throw new Error("missing claim type");
      }
      const id = nextClaim;
      nextClaim += 1;
      claims.push({
        id,
        driverId: row.driverId,
        claimTypeId: row.claimTypeId,
        orderReference: row.orderReference,
        notes: row.notes,
        occurredAt: row.occurredAt,
        status: "recorded",
        source: row.source,
        feeAmountCents: null,
        feeAppliedAt: null,
        feeBasis: null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      return id;
    },

    async updateClaimIfStatus(id, expected, patch: ClaimStatusPatch) {
      const claim = claims.find((item) => item.id === id && item.status === expected);
      if (!claim) return false;
      claim.status = patch.status;
      claim.updatedAt = patch.updatedAt;
      if (patch.feeAmountCents !== undefined) claim.feeAmountCents = patch.feeAmountCents;
      if (patch.feeAppliedAt !== undefined) claim.feeAppliedAt = patch.feeAppliedAt;
      if (patch.feeBasis !== undefined) claim.feeBasis = patch.feeBasis;
      return true;
    },

    async listClaims(filter: ClaimFilter = {}) {
      return claims
        .filter((claim) => {
          if (filter.driverId && claim.driverId !== filter.driverId) return false;
          if (filter.claimTypeId && claim.claimTypeId !== filter.claimTypeId) return false;
          if (filter.status && claim.status !== filter.status) return false;
          if (filter.openOnly && !OPEN_STATUSES.includes(claim.status)) return false;
          return true;
        })
        .slice()
        .sort((a, b) => {
          if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
          return b.id - a.id;
        })
        .map(toListItem);
    },

    async countClaimsByStatus() {
      const counts: Partial<Record<ClaimStatus, number>> = {};
      for (const claim of claims) {
        counts[claim.status] = (counts[claim.status] ?? 0) + 1;
      }
      return counts;
    },

    async getClaimRecord(id): Promise<ClaimRecord | undefined> {
      const claim = claims.find((item) => item.id === id);
      if (!claim) return undefined;
      const driver = drivers.find((item) => item.id === claim.driverId);
      const type = claimTypes.find((item) => item.id === claim.claimTypeId);
      if (!driver || !type) throw new Error("Claim row is missing its driver or type.");
      const typeFee = fees.find(
        (fee) => fee.driverId === claim.driverId && fee.claimTypeId === claim.claimTypeId,
      );
      return {
        id: claim.id,
        driverId: claim.driverId,
        driverName: driver.name,
        driverEmail: driver.email,
        defaultFeeCents: driver.defaultFeeCents,
        claimTypeId: claim.claimTypeId,
        claimTypeLabel: type.label,
        claimTypeDescription: type.description,
        orderReference: claim.orderReference,
        notes: claim.notes,
        occurredAt: claim.occurredAt,
        status: claim.status,
        source: claim.source,
        feeAmountCents: claim.feeAmountCents,
        feeAppliedAt: claim.feeAppliedAt,
        feeBasis: claim.feeBasis,
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt,
        typeFeeCents: typeFee ? typeFee.amountCents : null,
      };
    },

    async insertEmail(row: EmailInsert) {
      const id = nextEmail;
      nextEmail += 1;
      emails.push({
        id,
        claimId: row.claimId,
        driverId: row.driverId,
        to: row.to,
        subject: row.subject,
        body: row.body,
        transport: row.transport,
        status: row.status,
        error: row.error,
        providerMessageId: row.providerMessageId,
        createdAt: row.createdAt,
        sentAt: row.sentAt,
      });
      return id;
    },

    async listEmails(claimId) {
      return emails.filter((email) => email.claimId === claimId).sort((a, b) => a.id - b.id);
    },

    async listRecentEmails(limit) {
      return emails
        .slice()
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map((email) => {
          const driver = drivers.find((item) => item.id === email.driverId);
          if (!driver) throw new Error("Email row is missing its driver.");
          if (!isEmailStatus(email.status) || !isEmailTransport(email.transport)) {
            throw new Error("Unexpected email row.");
          }
          return {
            id: email.id,
            claimId: email.claimId,
            to: email.to,
            subject: email.subject,
            status: email.status,
            transport: email.transport,
            createdAt: email.createdAt,
            error: email.error,
            driverName: driver.name,
          } satisfies RecentEmail;
        });
    },

    async insertEvent(row: EventInsert) {
      if (!isEventKind(row.kind)) throw new Error("Unexpected event kind.");
      events.push({
        id: nextEvent,
        claimId: row.claimId,
        kind: row.kind,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        message: row.message,
        emailId: row.emailId,
        createdAt: row.createdAt,
      });
      nextEvent += 1;
    },

    async listEvents(claimId) {
      return events
        .filter((event) => event.claimId === claimId)
        .sort((a, b) => a.id - b.id)
        .map(({ claimId: _claimId, ...event }) => event);
    },
  };

  return store;
}

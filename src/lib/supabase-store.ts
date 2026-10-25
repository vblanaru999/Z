import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAIM_TYPE_SEEDS } from "./catalog";
import type {
  ClaimEventView,
  ClaimFilter,
  ClaimListItem,
  ClaimStatus,
  ClaimType,
  Driver,
  DriverFee,
  DriverListItem,
  EmailRecord,
  RecentEmail,
} from "./types";
import {
  CLAIM_STATUSES,
  isClaimSource,
  isClaimStatus,
  isEmailStatus,
  isEmailTransport,
  isEventKind,
  isFeeBasis,
  OPEN_STATUSES,
  type FeeBasis,
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

type QueryError = { message: string } | null;

function unwrap<T>(result: { data: T; error: QueryError }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function asNumber(value: number | string | null | undefined): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error("Unexpected number from Supabase.");
  return number;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  throw new Error("Unexpected text from Supabase.");
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return asString(value);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type DriverJoin = { name: string; email?: string; default_fee_cents?: number };
type TypeJoin = { label: string; description?: string };

export function createSupabaseStore(client: SupabaseClient): Store {
  function mapClaimType(row: {
    id: number | string;
    code: string;
    label: string;
    description: string;
  }): ClaimType {
    return {
      id: asNumber(row.id),
      code: row.code,
      label: row.label,
      description: row.description,
    };
  }

  function mapDriver(row: {
    id: number | string;
    name: string;
    email: string;
    default_fee_cents: number | string;
    created_at: unknown;
    updated_at: unknown;
  }): Driver {
    return {
      id: asNumber(row.id),
      name: row.name,
      email: row.email,
      defaultFeeCents: asNumber(row.default_fee_cents),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    };
  }

  function mapEmail(row: {
    id: number | string;
    claim_id: number | string;
    driver_id: number | string;
    to_address: string;
    subject: string;
    body: string;
    transport: string;
    status: string;
    error: string | null;
    provider_message_id: string | null;
    created_at: unknown;
    sent_at: unknown;
  }): EmailRecord {
    if (!isEmailTransport(row.transport) || !isEmailStatus(row.status)) {
      throw new Error("Unexpected email row.");
    }
    return {
      id: asNumber(row.id),
      claimId: asNumber(row.claim_id),
      driverId: asNumber(row.driver_id),
      to: row.to_address,
      subject: row.subject,
      body: row.body,
      transport: row.transport,
      status: row.status,
      error: row.error,
      providerMessageId: row.provider_message_id,
      createdAt: asString(row.created_at),
      sentAt: asNullableString(row.sent_at),
    };
  }

  return {
    async seedClaimTypes() {
      const existing = unwrap(
        await client.from("claim_types").select("id, code, label, description"),
      ) as { id: number | string; code: string }[];
      const byCode = new Set(existing.map((row) => row.code));
      for (const seed of CLAIM_TYPE_SEEDS) {
        if (byCode.has(seed.code)) {
          unwrap(
            await client
              .from("claim_types")
              .update({ label: seed.label, description: seed.description })
              .eq("code", seed.code),
          );
        } else {
          unwrap(
            await client.from("claim_types").insert({
              code: seed.code,
              label: seed.label,
              description: seed.description,
            }),
          );
        }
      }
    },

    async listClaimTypes() {
      const rows = unwrap(
        await client
          .from("claim_types")
          .select("id, code, label, description")
          .order("id", { ascending: true }),
      ) as Parameters<typeof mapClaimType>[0][];
      return rows.map(mapClaimType);
    },

    async getClaimType(id) {
      const row = unwrap(
        await client
          .from("claim_types")
          .select("id, code, label, description")
          .eq("id", id)
          .maybeSingle(),
      ) as Parameters<typeof mapClaimType>[0] | null;
      return row ? mapClaimType(row) : undefined;
    },

    async insertDriver(row: DriverRowInput) {
      const inserted = unwrap(
        await client
          .from("drivers")
          .insert({
            name: row.name,
            email: row.email,
            default_fee_cents: row.defaultFeeCents,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
          })
          .select("id")
          .single(),
      ) as { id: number | string };
      return asNumber(inserted.id);
    },

    async updateDriverRow(id, row: DriverRowPatch) {
      unwrap(
        await client
          .from("drivers")
          .update({
            name: row.name,
            email: row.email,
            default_fee_cents: row.defaultFeeCents,
            updated_at: row.updatedAt,
          })
          .eq("id", id),
      );
    },

    async replaceDriverFees(driverId, fees) {
      unwrap(await client.from("driver_fee_terms").delete().eq("driver_id", driverId));
      if (fees.length === 0) return;
      unwrap(
        await client.from("driver_fee_terms").insert(
          fees.map((fee) => ({
            driver_id: driverId,
            claim_type_id: fee.claimTypeId,
            amount_cents: fee.amountCents,
          })),
        ),
      );
    },

    async getDriver(id) {
      const row = unwrap(
        await client
          .from("drivers")
          .select("id, name, email, default_fee_cents, created_at, updated_at")
          .eq("id", id)
          .maybeSingle(),
      ) as Parameters<typeof mapDriver>[0] | null;
      return row ? mapDriver(row) : undefined;
    },

    async getDriverByEmail(email) {
      const row = unwrap(
        await client
          .from("drivers")
          .select("id, name, email, default_fee_cents, created_at, updated_at")
          .eq("email", email)
          .limit(1)
          .maybeSingle(),
      ) as Parameters<typeof mapDriver>[0] | null;
      return row ? mapDriver(row) : undefined;
    },

    async listDrivers() {
      const driverRows = unwrap(
        await client
          .from("drivers")
          .select("id, name, email, default_fee_cents, created_at, updated_at"),
      ) as Parameters<typeof mapDriver>[0][];
      const feeRows = unwrap(
        await client.from("driver_fee_terms").select("driver_id, claim_type_id, amount_cents, claim_types(label)"),
      ) as {
        driver_id: number | string;
        claim_type_id: number | string;
        amount_cents: number | string;
        claim_types: { label: string } | { label: string }[] | null;
      }[];
      const byDriver = new Map<number, DriverFee[]>();
      for (const row of feeRows) {
        const driverId = asNumber(row.driver_id);
        const type = one(row.claim_types);
        const list = byDriver.get(driverId) ?? [];
        list.push({
          claimTypeId: asNumber(row.claim_type_id),
          claimTypeLabel: type?.label ?? "",
          amountCents: asNumber(row.amount_cents),
        });
        byDriver.set(driverId, list);
      }
      for (const list of byDriver.values()) {
        list.sort((a, b) => a.claimTypeId - b.claimTypeId);
      }
      return driverRows
        .map(mapDriver)
        .sort((a, b) => {
          const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          return byName !== 0 ? byName : a.id - b.id;
        })
        .map((driver) => ({ ...driver, typeFees: byDriver.get(driver.id) ?? [] }));
    },

    async listDriverFees(driverId) {
      const rows = unwrap(
        await client
          .from("driver_fee_terms")
          .select("claim_type_id, amount_cents, claim_types(label)")
          .eq("driver_id", driverId)
          .order("claim_type_id", { ascending: true }),
      ) as {
        claim_type_id: number | string;
        amount_cents: number | string;
        claim_types: { label: string } | { label: string }[] | null;
      }[];
      return rows.map((row) => ({
        claimTypeId: asNumber(row.claim_type_id),
        claimTypeLabel: one(row.claim_types)?.label ?? "",
        amountCents: asNumber(row.amount_cents),
      }));
    },

    async typeFeeCents(driverId, claimTypeId) {
      const row = unwrap(
        await client
          .from("driver_fee_terms")
          .select("amount_cents")
          .eq("driver_id", driverId)
          .eq("claim_type_id", claimTypeId)
          .maybeSingle(),
      ) as { amount_cents: number | string } | null;
      return row ? asNumber(row.amount_cents) : null;
    },

    async insertClaim(row: ClaimInsert) {
      const inserted = unwrap(
        await client
          .from("claims")
          .insert({
            driver_id: row.driverId,
            claim_type_id: row.claimTypeId,
            order_reference: row.orderReference,
            notes: row.notes,
            occurred_at: row.occurredAt,
            status: "recorded",
            source: "manual",
            created_at: row.createdAt,
            updated_at: row.updatedAt,
          })
          .select("id")
          .single(),
      ) as { id: number | string };
      return asNumber(inserted.id);
    },

    async updateClaimIfStatus(id, expected, patch: ClaimStatusPatch) {
      const changes: Record<string, string | number> = {
        status: patch.status,
        updated_at: patch.updatedAt,
      };
      if (patch.feeAmountCents !== undefined) changes.fee_amount_cents = patch.feeAmountCents;
      if (patch.feeAppliedAt !== undefined) changes.fee_applied_at = patch.feeAppliedAt;
      if (patch.feeBasis !== undefined) changes.fee_basis = patch.feeBasis;
      const rows = unwrap(
        await client
          .from("claims")
          .update(changes)
          .eq("id", id)
          .eq("status", expected)
          .select("id"),
      ) as { id: number | string }[] | null;
      return Array.isArray(rows) && rows.length === 1;
    },

    async listClaims(filter: ClaimFilter = {}) {
      let query = client.from("claims").select(
        "id, driver_id, claim_type_id, order_reference, occurred_at, status, source, fee_amount_cents, drivers!inner(name), claim_types!inner(label)",
      );
      if (filter.driverId) query = query.eq("driver_id", filter.driverId);
      if (filter.claimTypeId) query = query.eq("claim_type_id", filter.claimTypeId);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.openOnly) query = query.in("status", [...OPEN_STATUSES]);
      const rows = unwrap(
        await query.order("occurred_at", { ascending: false }).order("id", { ascending: false }),
      ) as {
        id: number | string;
        driver_id: number | string;
        claim_type_id: number | string;
        order_reference: string | null;
        occurred_at: unknown;
        status: string;
        source: string;
        fee_amount_cents: number | string | null;
        drivers: DriverJoin | DriverJoin[] | null;
        claim_types: TypeJoin | TypeJoin[] | null;
      }[];
      return rows.map((row) => {
        if (!isClaimStatus(row.status) || !isClaimSource(row.source)) {
          throw new Error("Claim row has an unexpected status or source.");
        }
        const driver = one(row.drivers);
        const type = one(row.claim_types);
        if (!driver || !type) throw new Error("Claim row is missing its driver or type.");
        return {
          id: asNumber(row.id),
          driverId: asNumber(row.driver_id),
          driverName: driver.name,
          claimTypeId: asNumber(row.claim_type_id),
          claimTypeLabel: type.label,
          orderReference: row.order_reference,
          occurredAt: asString(row.occurred_at),
          status: row.status,
          source: row.source,
          feeAmountCents: row.fee_amount_cents === null ? null : asNumber(row.fee_amount_cents),
        } satisfies ClaimListItem;
      });
    },

    async countClaimsByStatus() {
      const counts: Partial<Record<ClaimStatus, number>> = {};
      for (const status of CLAIM_STATUSES) {
        const result = await client
          .from("claims")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (result.error) throw new Error(result.error.message);
        counts[status] = result.count ?? 0;
      }
      return counts;
    },

    async getClaimRecord(id): Promise<ClaimRecord | undefined> {
      const row = unwrap(
        await client
          .from("claims")
          .select(
            "id, driver_id, claim_type_id, order_reference, notes, occurred_at, status, source, fee_amount_cents, fee_applied_at, fee_basis, created_at, updated_at, drivers!inner(name, email, default_fee_cents), claim_types!inner(label, description)",
          )
          .eq("id", id)
          .maybeSingle(),
      ) as {
        id: number | string;
        driver_id: number | string;
        claim_type_id: number | string;
        order_reference: string | null;
        notes: string;
        occurred_at: unknown;
        status: string;
        source: string;
        fee_amount_cents: number | string | null;
        fee_applied_at: unknown;
        fee_basis: string | null;
        created_at: unknown;
        updated_at: unknown;
        drivers: DriverJoin | DriverJoin[] | null;
        claim_types: TypeJoin | TypeJoin[] | null;
      } | null;
      if (!row) return undefined;
      if (!isClaimStatus(row.status) || !isClaimSource(row.source)) {
        throw new Error("Claim row has an unexpected status or source.");
      }
      let feeBasis: FeeBasis | null = null;
      if (row.fee_basis) {
        if (!isFeeBasis(row.fee_basis)) throw new Error("Claim row has an unexpected fee basis.");
        feeBasis = row.fee_basis;
      }
      const driver = one(row.drivers);
      const type = one(row.claim_types);
      if (!driver?.email || driver.default_fee_cents === undefined || !type?.description) {
        throw new Error("Claim row is missing its driver or type.");
      }
      const fee = unwrap(
        await client
          .from("driver_fee_terms")
          .select("amount_cents")
          .eq("driver_id", asNumber(row.driver_id))
          .eq("claim_type_id", asNumber(row.claim_type_id))
          .maybeSingle(),
      ) as { amount_cents: number | string } | null;
      return {
        id: asNumber(row.id),
        driverId: asNumber(row.driver_id),
        driverName: driver.name,
        driverEmail: driver.email,
        defaultFeeCents: asNumber(driver.default_fee_cents),
        claimTypeId: asNumber(row.claim_type_id),
        claimTypeLabel: type.label,
        claimTypeDescription: type.description,
        orderReference: row.order_reference,
        notes: row.notes,
        occurredAt: asString(row.occurred_at),
        status: row.status,
        source: row.source,
        feeAmountCents: row.fee_amount_cents === null ? null : asNumber(row.fee_amount_cents),
        feeAppliedAt: asNullableString(row.fee_applied_at),
        feeBasis,
        createdAt: asString(row.created_at),
        updatedAt: asString(row.updated_at),
        typeFeeCents: fee ? asNumber(fee.amount_cents) : null,
      };
    },

    async insertEmail(row: EmailInsert) {
      const inserted = unwrap(
        await client
          .from("emails")
          .insert({
            claim_id: row.claimId,
            driver_id: row.driverId,
            to_address: row.to,
            subject: row.subject,
            body: row.body,
            transport: row.transport,
            status: row.status,
            error: row.error,
            provider_message_id: row.providerMessageId,
            created_at: row.createdAt,
            sent_at: row.sentAt,
          })
          .select("id")
          .single(),
      ) as { id: number | string };
      return asNumber(inserted.id);
    },

    async listEmails(claimId) {
      const rows = unwrap(
        await client
          .from("emails")
          .select(
            "id, claim_id, driver_id, to_address, subject, body, transport, status, error, provider_message_id, created_at, sent_at",
          )
          .eq("claim_id", claimId)
          .order("id", { ascending: true }),
      ) as Parameters<typeof mapEmail>[0][];
      return rows.map(mapEmail);
    },

    async listRecentEmails(limit) {
      const rows = unwrap(
        await client
          .from("emails")
          .select(
            "id, claim_id, to_address, subject, status, transport, created_at, error, drivers!inner(name)",
          )
          .order("id", { ascending: false })
          .limit(limit),
      ) as {
        id: number | string;
        claim_id: number | string;
        to_address: string;
        subject: string;
        status: string;
        transport: string;
        created_at: unknown;
        error: string | null;
        drivers: { name: string } | { name: string }[] | null;
      }[];
      return rows.map((row) => {
        if (!isEmailStatus(row.status) || !isEmailTransport(row.transport)) {
          throw new Error("Unexpected email row.");
        }
        const driver = one(row.drivers);
        if (!driver) throw new Error("Email row is missing its driver.");
        return {
          id: asNumber(row.id),
          claimId: asNumber(row.claim_id),
          to: row.to_address,
          subject: row.subject,
          status: row.status,
          transport: row.transport,
          createdAt: asString(row.created_at),
          error: row.error,
          driverName: driver.name,
        };
      });
    },

    async insertEvent(row: EventInsert) {
      unwrap(
        await client.from("claim_events").insert({
          claim_id: row.claimId,
          kind: row.kind,
          from_status: row.fromStatus,
          to_status: row.toStatus,
          message: row.message,
          email_id: row.emailId,
          created_at: row.createdAt,
        }),
      );
    },

    async listEvents(claimId) {
      const rows = unwrap(
        await client
          .from("claim_events")
          .select("id, kind, from_status, to_status, message, email_id, created_at")
          .eq("claim_id", claimId)
          .order("id", { ascending: true }),
      ) as {
        id: number | string;
        kind: string;
        from_status: string | null;
        to_status: string | null;
        message: string;
        email_id: number | string | null;
        created_at: unknown;
      }[];
      return rows.map((row) => {
        if (!isEventKind(row.kind)) throw new Error("Unexpected event kind.");
        const fromStatus = row.from_status && isClaimStatus(row.from_status) ? row.from_status : null;
        const toStatus = row.to_status && isClaimStatus(row.to_status) ? row.to_status : null;
        return {
          id: asNumber(row.id),
          kind: row.kind,
          fromStatus,
          toStatus,
          message: row.message,
          emailId: row.email_id === null ? null : asNumber(row.email_id),
          createdAt: asString(row.created_at),
        } satisfies ClaimEventView;
      });
    },
  };
}

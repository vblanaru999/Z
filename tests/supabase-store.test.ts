import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClaimSupabaseClient } from "../src/lib/db";
import { createSupabaseStore } from "../src/lib/supabase-store";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

type Call = {
  table: string;
  op: string;
  filters: [string, unknown][];
  payload: unknown;
};

function fakeClient(answer: (call: Call) => { data: unknown; error: null; count?: number }) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      const call: Call = { table, op: "", filters: [], payload: undefined };
      const builder = {
        select(columns?: unknown) {
          if (!call.op) {
            call.op = "select";
            call.payload = columns;
          }
          return builder;
        },
        insert(payload: unknown) {
          call.op = "insert";
          call.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          call.op = "update";
          call.payload = payload;
          return builder;
        },
        delete() {
          call.op = "delete";
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return builder;
        },
        in() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          return finish();
        },
        single() {
          return finish();
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return finish().then(resolve, reject);
        },
      };
      function finish() {
        const snapshot: Call = {
          table: call.table,
          op: call.op,
          filters: call.filters.slice(),
          payload: call.payload,
        };
        calls.push(snapshot);
        return Promise.resolve(answer(snapshot));
      }
      return builder;
    },
  };
}

describe("supabase client", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockClear();
  });

  it("requires the secret key and ignores a publishable key", () => {
    expect(() =>
      createClaimSupabaseClient({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("passes the secret key to the server client", () => {
    createClaimSupabaseClient({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_only",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    });
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_secret_test_only",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
  });
});

describe("supabase store queries", () => {
  it("reads claim types from claim_types", async () => {
    const client = fakeClient((call) => {
      if (call.table === "claim_types" && call.op === "select") {
        return {
          data: [
            {
              id: 1,
              code: "order_not_closed",
              label: "Order not closed in the app",
              description: "Left open.",
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    });
    const store = createSupabaseStore(client as never);
    const types = await store.listClaimTypes();
    expect(types).toEqual([
      {
        id: 1,
        code: "order_not_closed",
        label: "Order not closed in the app",
        description: "Left open.",
      },
    ]);
    expect(client.calls[0]).toMatchObject({ table: "claim_types", op: "select" });
  });

  it("inserts a driver into drivers", async () => {
    const client = fakeClient(() => ({ data: { id: 7 }, error: null }));
    const store = createSupabaseStore(client as never);
    const id = await store.insertDriver({
      name: "Ada Lovelace",
      email: "ada@example.com",
      defaultFeeCents: 2500,
      createdAt: "2026-10-25T12:00:00.000Z",
      updatedAt: "2026-10-25T12:00:00.000Z",
    });
    expect(id).toBe(7);
    expect(client.calls[0]).toMatchObject({
      table: "drivers",
      op: "insert",
      payload: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        default_fee_cents: 2500,
        created_at: "2026-10-25T12:00:00.000Z",
        updated_at: "2026-10-25T12:00:00.000Z",
      },
    });
  });

  it("updates a claim only when the expected status still matches", async () => {
    const client = fakeClient(() => ({ data: [{ id: 3 }], error: null }));
    const store = createSupabaseStore(client as never);
    const changed = await store.updateClaimIfStatus(3, "warning_sent", {
      status: "fee_applied",
      updatedAt: "2026-10-25T12:04:00.000Z",
      feeAmountCents: 2000,
      feeAppliedAt: "2026-10-25T12:04:00.000Z",
      feeBasis: "default",
    });
    expect(changed).toBe(true);
    expect(client.calls[0]).toMatchObject({
      table: "claims",
      op: "update",
      filters: [
        ["id", 3],
        ["status", "warning_sent"],
      ],
      payload: {
        status: "fee_applied",
        updated_at: "2026-10-25T12:04:00.000Z",
        fee_amount_cents: 2000,
        fee_applied_at: "2026-10-25T12:04:00.000Z",
        fee_basis: "default",
      },
    });
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const schema = fs.readFileSync(path.join(process.cwd(), "supabase", "schema.sql"), "utf8");

describe("supabase schema", () => {
  it("creates the claim tables, indexes, and seeded types", () => {
    for (const table of [
      "claim_types",
      "drivers",
      "driver_fee_terms",
      "claims",
      "emails",
      "claim_events",
    ]) {
      expect(schema).toContain(`public.${table}`);
    }
    expect(schema).toContain("idx_claims_status");
    expect(schema).toContain("idx_claims_driver");
    expect(schema).toContain("idx_claims_type");
    expect(schema).toContain("idx_events_claim");
    expect(schema).toContain("idx_emails_claim");
    expect(schema).toContain("Order not closed in the app");
    expect(schema).toContain("Delivery label not scanned");
    expect(schema).toContain("Poor or missing delivery photo attached to the order");
    expect(schema).toContain("occurred_at timestamptz");
    expect(schema).toContain("'manual', 'xcelerator'");
    expect(schema).toContain("'outbox', 'smtp', 'smtp2go'");
    expect(schema).toContain("provider_message_id");
    expect(schema).toContain("enable row level security");
  });
});

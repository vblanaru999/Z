import fs from "node:fs";
import { listClaimTypes } from "../src/lib/catalog";
import { createClaim, listClaims } from "../src/lib/claims";
import { getStore } from "../src/lib/db";
import { createDriver, getDriverByEmail } from "../src/lib/drivers";

function loadEnvFile(): void {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding. Paste supabase/schema.sql in the Supabase SQL editor first.",
    );
  }
  const db = await getStore();
  const types = await listClaimTypes(db);
  const photo = types.find((type) => type.code === "poor_delivery_photo");
  const closed = types.find((type) => type.code === "order_not_closed");
  if (!photo || !closed) {
    throw new Error("Claim types were not seeded. Run supabase/schema.sql in the Supabase SQL editor.");
  }

  let maria = await getDriverByEmail(db, "maria.alvarez@example.com");
  if (!maria) {
    const id = await createDriver(db, {
      name: "Maria Alvarez",
      email: "maria.alvarez@example.com",
      defaultFeeCents: 2500,
      typeFees: [{ claimTypeId: photo.id, amountCents: 4000 }],
    });
    maria = await getDriverByEmail(db, "maria.alvarez@example.com");
    console.log(`Added Maria Alvarez (#${id}).`);
  } else {
    console.log("Maria Alvarez is already on file.");
  }

  if (!(await getDriverByEmail(db, "james.okonkwo@example.com"))) {
    const id = await createDriver(db, {
      name: "James Okonkwo",
      email: "james.okonkwo@example.com",
      defaultFeeCents: 2000,
      typeFees: [],
    });
    console.log(`Added James Okonkwo (#${id}).`);
  } else {
    console.log("James Okonkwo is already on file.");
  }

  const existing = maria ? await listClaims(db, { driverId: maria.id }) : [];
  if (maria && !existing.some((claim) => claim.orderReference === "48219")) {
    const id = await createClaim(db, {
      driverId: maria.id,
      claimTypeId: closed.id,
      orderReference: "48219",
      notes: "The stop was finished, but order 48219 was still open in the driver app.",
      occurredAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    });
    console.log(`Recorded sample claim #${id} for order 48219.`);
  } else {
    console.log("Sample claim for order 48219 is already recorded.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Seed failed.";
  console.error(message);
  process.exit(1);
});

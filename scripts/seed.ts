import { listClaimTypes } from "../src/lib/catalog";
import { localDateInputValue } from "../src/lib/format";
import { createClaim, listClaims } from "../src/lib/claims";
import { databasePath, openDatabase } from "../src/lib/db";
import { createDriver, getDriverByEmail } from "../src/lib/drivers";

const db = openDatabase(databasePath());
const types = listClaimTypes(db);
const photo = types.find((type) => type.code === "poor_delivery_photo");
const closed = types.find((type) => type.code === "order_not_closed");
if (!photo || !closed) {
  throw new Error("Claim types were not seeded.");
}

let maria = getDriverByEmail(db, "maria.alvarez@example.com");
if (!maria) {
  const id = createDriver(db, {
    name: "Maria Alvarez",
    email: "maria.alvarez@example.com",
    defaultFeeCents: 2500,
    typeFees: [{ claimTypeId: photo.id, amountCents: 4000 }],
  });
  maria = getDriverByEmail(db, "maria.alvarez@example.com");
  console.log(`Added Maria Alvarez (#${id}).`);
} else {
  console.log("Maria Alvarez is already on file.");
}

if (!getDriverByEmail(db, "james.okonkwo@example.com")) {
  const id = createDriver(db, {
    name: "James Okonkwo",
    email: "james.okonkwo@example.com",
    defaultFeeCents: 2000,
    typeFees: [],
  });
  console.log(`Added James Okonkwo (#${id}).`);
} else {
  console.log("James Okonkwo is already on file.");
}

const existing = maria ? listClaims(db, { driverId: maria.id }) : [];
if (maria && !existing.some((claim) => claim.orderReference === "48219")) {
  const id = createClaim(db, {
    driverId: maria.id,
    claimTypeId: closed.id,
    orderReference: "48219",
    notes: "The stop was finished, but order 48219 was still open in the driver app.",
    occurredAt: localDateInputValue(new Date(Date.now() - 26 * 60 * 60 * 1000)),
  });
  console.log(`Recorded sample claim #${id} for order 48219.`);
} else {
  console.log("Sample claim for order 48219 is already recorded.");
}

db.close();
console.log(`Database: ${databasePath()}`);

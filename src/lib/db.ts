import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedClaimTypes } from "./catalog";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS claim_types (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  default_fee_cents INTEGER NOT NULL CHECK (default_fee_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS driver_fee_terms (
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  claim_type_id INTEGER NOT NULL REFERENCES claim_types(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  PRIMARY KEY (driver_id, claim_type_id)
);

-- source 'manual' is written by this app. 'xcelerator' is reserved for a later import.
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES drivers(id),
  claim_type_id INTEGER NOT NULL REFERENCES claim_types(id),
  order_reference TEXT,
  notes TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded', 'warning_sent', 'fee_applied', 'resolved', 'waived')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'xcelerator')),
  fee_amount_cents INTEGER,
  fee_applied_at TEXT,
  fee_basis TEXT CHECK (fee_basis IN ('default', 'claim_type') OR fee_basis IS NULL),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES claims(id),
  driver_id INTEGER NOT NULL REFERENCES drivers(id),
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('outbox', 'smtp')),
  status TEXT NOT NULL CHECK (status IN ('saved', 'sent', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS claim_events (
  id INTEGER PRIMARY KEY,
  claim_id INTEGER NOT NULL REFERENCES claims(id),
  kind TEXT NOT NULL CHECK (kind IN ('created', 'status_change', 'email')),
  from_status TEXT,
  to_status TEXT,
  message TEXT NOT NULL,
  email_id INTEGER REFERENCES emails(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_driver ON claims(driver_id);
CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type_id);
CREATE INDEX IF NOT EXISTS idx_events_claim ON claim_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_emails_claim ON emails(claim_id);
`;

export function databasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "data", "claim.db");
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may already be closed.
    }
    throw error;
  }
}

export function insertId(result: { lastInsertRowid: number | bigint }): number {
  return typeof result.lastInsertRowid === "bigint"
    ? Number(result.lastInsertRowid)
    : result.lastInsertRowid;
}

export function changed(result: { changes: number | bigint }): number {
  return typeof result.changes === "bigint" ? Number(result.changes) : result.changes;
}

export function openDatabase(filename: string): DatabaseSync {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  db.exec(SCHEMA);
  seedClaimTypes(db);
  return db;
}

const globalForDb = globalThis as unknown as { claimDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.claimDb) {
    globalForDb.claimDb = openDatabase(databasePath());
  }
  return globalForDb.claimDb;
}

import type { DatabaseSync } from "node:sqlite";
import { changed, insertId, withTransaction } from "./db";
import { AppError } from "./errors";
import { nowIso } from "./format";
import {
  EXCEPTION_KINDS,
  EXCEPTION_LABELS,
  isExceptionKind,
  isLoadStatus,
  isSortOutcome,
  type CompleteUnloadInput,
  type ExceptionKind,
  type InboundLoad,
  type LoadException,
  type LoadExceptionInput,
  type LoadListFilter,
  type LoadListItem,
  type LoadStats,
  type LoadStatus,
  type ReceivingInput,
  type StartUnloadInput,
} from "./load-types";
import { rowNumber, rowNumberOrNull, rowString, rowStringOrNull, type SqlRow } from "./rows";

/**
 * Inbound lifecycle for one trailer:
 * receiving save → waiting → start unload → unloading → finish unload → done.
 * Stage 2 cannot be completed while the load is still waiting.
 */

const COUNT_LIMIT = 1_000_000;

function requiredText(raw: string, empty: string, max: number, tooLong: string): string {
  const value = raw.trim();
  if (!value) throw new AppError(empty);
  if (value.length > max) throw new AppError(tooLong);
  return value;
}

function optionalText(raw: string, max: number, tooLong: string): string {
  const value = raw.trim();
  if (value.length > max) throw new AppError(tooLong);
  return value;
}

function assertCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > COUNT_LIMIT) {
    throw new AppError(`Enter ${label} as a whole number from 0 to 1,000,000.`);
  }
  return value;
}

function parseCount(raw: string, label: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new AppError(`Enter ${label} as a whole number from 0 to 1,000,000.`);
  }
  return assertCount(Number(trimmed), label);
}

function normalizeDate(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new AppError(`Enter ${label}.`);
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new AppError(`Enter a valid ${label}.`);
  return date.toISOString();
}

export function normalizeReceiving(input: ReceivingInput): ReceivingInput {
  return {
    arrivedAt: normalizeDate(input.arrivedAt, "arrival time"),
    carrier: requiredText(input.carrier, "Enter the carrier.", 120, "Keep the carrier under 120 characters."),
    trailerNumber: requiredText(
      input.trailerNumber,
      "Enter the trailer number.",
      80,
      "Keep the trailer number under 80 characters.",
    ),
    sealNumber: requiredText(
      input.sealNumber,
      "Enter the seal number.",
      80,
      "Keep the seal number under 80 characters.",
    ),
    bolPro: requiredText(
      input.bolPro,
      "Enter the BOL or PRO.",
      80,
      "Keep the BOL or PRO under 80 characters.",
    ),
    references: requiredText(
      input.references,
      "Enter at least one PO or ASN.",
      2000,
      "Keep the PO and ASN references under 2000 characters.",
    ),
    dockDoor: requiredText(
      input.dockDoor,
      "Enter the dock or door.",
      80,
      "Keep the dock or door under 80 characters.",
    ),
    driverName: requiredText(
      input.driverName,
      "Enter the driver name.",
      120,
      "Keep the driver name under 120 characters.",
    ),
    expectedPallets: assertCount(input.expectedPallets, "expected pallets"),
    expectedPieces: assertCount(input.expectedPieces, "expected pieces"),
    notes: optionalText(input.notes, 2000, "Keep the notes under 2000 characters."),
  };
}

export function normalizeStart(input: StartUnloadInput): StartUnloadInput {
  return {
    startedAt: normalizeDate(input.startedAt, "unload start"),
    unloadedBy: requiredText(
      input.unloadedBy,
      "Enter who unloaded the trailer.",
      120,
      "Keep the unloader's name under 120 characters.",
    ),
  };
}

function normalizeException(input: LoadExceptionInput): LoadExceptionInput {
  if (!isExceptionKind(input.kind)) throw new AppError("Choose a damage, shortage, or overage.");
  const label = EXCEPTION_LABELS[input.kind].toLowerCase();
  const notes = requiredText(input.notes, `Describe the ${label}.`, 500, `Keep the ${label} note under 500 characters.`);
  const quantity = input.quantity === null ? null : assertCount(input.quantity, `the ${label} quantity`);
  return { kind: input.kind, notes, quantity };
}

export function normalizeComplete(
  input: CompleteUnloadInput,
  expected: { pallets: number; pieces: number },
): CompleteUnloadInput {
  const finishedAt = normalizeDate(input.finishedAt, "unload finish");
  const receivedPallets = assertCount(input.receivedPallets, "pallets received");
  const receivedPieces = assertCount(input.receivedPieces, "pieces received");
  if (!isSortOutcome(input.sortOutcome)) throw new AppError("Choose how the freight was sorted.");
  const putawayLocations = requiredText(
    input.putawayLocations,
    "Enter the putaway locations. If the freight is held, name the hold location.",
    2000,
    "Keep putaway locations under 2000 characters.",
  );
  const seen = new Set<ExceptionKind>();
  const exceptions: LoadExceptionInput[] = [];
  for (const exception of input.exceptions) {
    const normalized = normalizeException(exception);
    if (seen.has(normalized.kind)) {
      throw new AppError(`Record ${EXCEPTION_LABELS[normalized.kind].toLowerCase()} once.`);
    }
    seen.add(normalized.kind);
    exceptions.push(normalized);
  }
  if (
    (receivedPallets < expected.pallets || receivedPieces < expected.pieces) &&
    !seen.has("shortage")
  ) {
    throw new AppError("Received counts are short of the receiving record. Record a shortage.");
  }
  if (
    (receivedPallets > expected.pallets || receivedPieces > expected.pieces) &&
    !seen.has("overage")
  ) {
    throw new AppError("Received counts are over the receiving record. Record an overage.");
  }
  return {
    finishedAt,
    receivedPallets,
    receivedPieces,
    sortOutcome: input.sortOutcome,
    putawayLocations,
    exceptions,
  };
}

export function receivingFromForm(formData: FormData): ReceivingInput {
  return normalizeReceiving({
    arrivedAt: String(formData.get("arrivedAt") ?? ""),
    carrier: String(formData.get("carrier") ?? ""),
    trailerNumber: String(formData.get("trailerNumber") ?? ""),
    sealNumber: String(formData.get("sealNumber") ?? ""),
    bolPro: String(formData.get("bolPro") ?? ""),
    references: String(formData.get("references") ?? ""),
    dockDoor: String(formData.get("dockDoor") ?? ""),
    driverName: String(formData.get("driverName") ?? ""),
    expectedPallets: parseCount(String(formData.get("expectedPallets") ?? ""), "expected pallets"),
    expectedPieces: parseCount(String(formData.get("expectedPieces") ?? ""), "expected pieces"),
    notes: String(formData.get("notes") ?? ""),
  });
}

export function startFromForm(formData: FormData): StartUnloadInput {
  return normalizeStart({
    startedAt: String(formData.get("startedAt") ?? ""),
    unloadedBy: String(formData.get("unloadedBy") ?? ""),
  });
}

function exceptionFromForm(formData: FormData, kind: ExceptionKind): LoadExceptionInput | null {
  const notes = String(formData.get(`${kind}Notes`) ?? "");
  const quantityRaw = String(formData.get(`${kind}Quantity`) ?? "").trim();
  if (!notes.trim() && !quantityRaw) return null;
  return normalizeException({
    kind,
    notes,
    quantity: quantityRaw ? parseCount(quantityRaw, `the ${EXCEPTION_LABELS[kind].toLowerCase()} quantity`) : null,
  });
}

export function completeFromForm(formData: FormData): CompleteUnloadInput {
  const sortOutcome = String(formData.get("sortOutcome") ?? "");
  if (!isSortOutcome(sortOutcome)) throw new AppError("Choose how the freight was sorted.");
  const exceptions: LoadExceptionInput[] = [];
  for (const kind of EXCEPTION_KINDS) {
    const exception = exceptionFromForm(formData, kind);
    if (exception) exceptions.push(exception);
  }
  return {
    finishedAt: String(formData.get("finishedAt") ?? ""),
    receivedPallets: parseCount(String(formData.get("receivedPallets") ?? ""), "pallets received"),
    receivedPieces: parseCount(String(formData.get("receivedPieces") ?? ""), "pieces received"),
    sortOutcome,
    putawayLocations: String(formData.get("putawayLocations") ?? ""),
    exceptions,
  };
}

export function loadIdFromForm(formData: FormData): number {
  const id = Number(formData.get("loadId"));
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Load not found.");
  return id;
}

function mapException(row: SqlRow): LoadException {
  const kind = rowString(row, "kind");
  if (!isExceptionKind(kind)) throw new Error("Unexpected exception kind.");
  return {
    id: rowNumber(row, "id"),
    kind,
    quantity: rowNumberOrNull(row, "quantity"),
    notes: rowString(row, "notes"),
    createdAt: rowString(row, "created_at"),
  };
}

function listExceptions(db: DatabaseSync, loadId: number): LoadException[] {
  const rows = db
    .prepare(
      `SELECT id, kind, quantity, notes, created_at
       FROM inbound_exceptions
       WHERE load_id = ?
       ORDER BY id ASC`,
    )
    .all(loadId) as SqlRow[];
  return rows.map(mapException);
}

function mapListItem(row: SqlRow): LoadListItem {
  const status = rowString(row, "status");
  if (!isLoadStatus(status)) throw new Error("Load row has an unexpected status.");
  return {
    id: rowNumber(row, "id"),
    status,
    arrivedAt: rowString(row, "arrived_at"),
    carrier: rowString(row, "carrier"),
    trailerNumber: rowString(row, "trailer_number"),
    bolPro: rowString(row, "bol_pro"),
    dockDoor: rowString(row, "dock_door"),
    expectedPallets: rowNumber(row, "expected_pallets"),
    expectedPieces: rowNumber(row, "expected_pieces"),
  };
}

function mapLoad(row: SqlRow, exceptions: LoadException[]): InboundLoad {
  const base = mapListItem(row);
  const sortRaw = rowStringOrNull(row, "sort_outcome");
  const sortOutcome = sortRaw === null ? null : sortRaw;
  if (sortOutcome !== null && !isSortOutcome(sortOutcome)) {
    throw new Error("Load row has an unexpected sort outcome.");
  }
  const load: InboundLoad = {
    ...base,
    sealNumber: rowString(row, "seal_number"),
    references: rowString(row, "reference_numbers"),
    driverName: rowString(row, "driver_name"),
    receivingNotes: rowString(row, "receiving_notes"),
    unloadStartedAt: rowStringOrNull(row, "unload_started_at"),
    unloadedBy: rowStringOrNull(row, "unloaded_by"),
    unloadFinishedAt: rowStringOrNull(row, "unload_finished_at"),
    receivedPallets: rowNumberOrNull(row, "received_pallets"),
    receivedPieces: rowNumberOrNull(row, "received_pieces"),
    sortOutcome,
    putawayLocations: rowStringOrNull(row, "putaway_locations"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
    exceptions,
  };
  if (load.status !== "waiting" && (!load.unloadStartedAt || !load.unloadedBy)) {
    throw new Error("Unloading row is missing a start.");
  }
  if (
    load.status === "done" &&
    (load.unloadFinishedAt === null ||
      load.receivedPallets === null ||
      load.receivedPieces === null ||
      load.sortOutcome === null ||
      load.putawayLocations === null)
  ) {
    throw new Error("Finished load is missing unload details.");
  }
  return load;
}

const LOAD_COLUMNS = `
  id, status, arrived_at, carrier, trailer_number, seal_number, bol_pro,
  reference_numbers, dock_door, driver_name, expected_pallets, expected_pieces,
  receiving_notes, unload_started_at, unloaded_by, unload_finished_at,
  received_pallets, received_pieces, sort_outcome, putaway_locations,
  created_at, updated_at
`;

export function createLoad(db: DatabaseSync, input: ReceivingInput): number {
  const data = normalizeReceiving(input);
  return withTransaction(db, () => {
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO inbound_loads (
           status, arrived_at, carrier, trailer_number, seal_number, bol_pro,
           reference_numbers, dock_door, driver_name, expected_pallets, expected_pieces,
           receiving_notes, created_at, updated_at
         ) VALUES (
           'waiting', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         )`,
      )
      .run(
        data.arrivedAt,
        data.carrier,
        data.trailerNumber,
        data.sealNumber,
        data.bolPro,
        data.references,
        data.dockDoor,
        data.driverName,
        data.expectedPallets,
        data.expectedPieces,
        data.notes,
        now,
        now,
      );
    return insertId(result);
  });
}

export function getLoad(db: DatabaseSync, id: number): InboundLoad | null {
  const row = db.prepare(`SELECT ${LOAD_COLUMNS} FROM inbound_loads WHERE id = ?`).get(id) as
    | SqlRow
    | undefined;
  if (!row) return null;
  return mapLoad(row, listExceptions(db, id));
}

export function listLoads(db: DatabaseSync, filter: LoadListFilter = {}): LoadListItem[] {
  const params: string[] = [];
  let where = "";
  if (filter.status) {
    where = "WHERE status = ?";
    params.push(filter.status);
  }
  const oldestFirst = filter.status === "waiting" || filter.status === "unloading";
  const order = oldestFirst ? "arrived_at ASC, id ASC" : "arrived_at DESC, id DESC";
  const rows = db
    .prepare(`SELECT ${LOAD_COLUMNS} FROM inbound_loads ${where} ORDER BY ${order}`)
    .all(...params) as SqlRow[];
  return rows.map(mapListItem);
}

export function loadStats(db: DatabaseSync): LoadStats {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM inbound_loads GROUP BY status`)
    .all() as SqlRow[];
  const stats: LoadStats = { waiting: 0, unloading: 0, done: 0 };
  for (const row of rows) {
    const status = rowString(row, "status");
    if (!isLoadStatus(status)) continue;
    stats[status] = rowNumber(row, "n");
  }
  return stats;
}

function requireLoad(db: DatabaseSync, id: number): InboundLoad {
  const load = getLoad(db, id);
  if (!load) throw new AppError("Load not found.");
  return load;
}

function statusBlock(status: LoadStatus, action: "start" | "finish"): void {
  if (status === "done") throw new AppError("This load is already done.");
  if (action === "start" && status === "unloading") {
    throw new AppError("Unloading has already started.");
  }
  if (action === "finish" && status === "waiting") {
    throw new AppError("Start unloading before you finish this load.");
  }
}

export function startUnload(db: DatabaseSync, id: number, input: StartUnloadInput): void {
  const data = normalizeStart(input);
  withTransaction(db, () => {
    const load = requireLoad(db, id);
    statusBlock(load.status, "start");
    if (new Date(data.startedAt).getTime() < new Date(load.arrivedAt).getTime()) {
      throw new AppError("Unload cannot start before the trailer arrived.");
    }
    const now = nowIso();
    const update = db
      .prepare(
        `UPDATE inbound_loads
         SET status = 'unloading', unload_started_at = ?, unloaded_by = ?, updated_at = ?
         WHERE id = ? AND status = 'waiting'`,
      )
      .run(data.startedAt, data.unloadedBy, now, id);
    if (changed(update) !== 1) throw new AppError("This load changed. Refresh and try again.");
  });
}

export function completeUnload(db: DatabaseSync, id: number, input: CompleteUnloadInput): void {
  withTransaction(db, () => {
    const load = requireLoad(db, id);
    statusBlock(load.status, "finish");
    if (!load.unloadStartedAt) throw new AppError("Start unloading before you finish this load.");
    const data = normalizeComplete(input, {
      pallets: load.expectedPallets,
      pieces: load.expectedPieces,
    });
    if (new Date(data.finishedAt).getTime() < new Date(load.unloadStartedAt).getTime()) {
      throw new AppError("Unload cannot finish before it started.");
    }
    const now = nowIso();
    const update = db
      .prepare(
        `UPDATE inbound_loads
         SET status = 'done',
             unload_finished_at = ?,
             received_pallets = ?,
             received_pieces = ?,
             sort_outcome = ?,
             putaway_locations = ?,
             updated_at = ?
         WHERE id = ? AND status = 'unloading'`,
      )
      .run(
        data.finishedAt,
        data.receivedPallets,
        data.receivedPieces,
        data.sortOutcome,
        data.putawayLocations,
        now,
        id,
      );
    if (changed(update) !== 1) throw new AppError("This load changed. Refresh and try again.");
    const insert = db.prepare(
      `INSERT INTO inbound_exceptions (load_id, kind, quantity, notes, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const exception of data.exceptions) {
      insert.run(id, exception.kind, exception.quantity, exception.notes, now);
    }
  });
}

import fs from "node:fs";
import path from "node:path";
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
  type SortOutcome,
  type StartUnloadInput,
} from "./load-types";

/**
 * Inbound deliveries live in one JSON file per trailer under data/inbound/.
 * A delivery moves New → Confirmed → Arrived → Received → Altered.
 * Each move writes that file. A later read loads it back from disk.
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

/** One JSON file per trailer: data/inbound/1.json, data/inbound/2.json, and so on. */
export function inboundDataDir(): string {
  const configured = process.env.INBOUND_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), "data", "inbound");
}

function loadFile(dir: string, id: number): string {
  return path.join(dir, `${id}.json`);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(record: Record<string, unknown>, key: string, file: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Load file ${file} is missing ${key}.`);
  return value;
}

function expectStringOrNull(record: Record<string, unknown>, key: string, file: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error(`Load file ${file} is missing ${key}.`);
}

function expectNumber(record: Record<string, unknown>, key: string, file: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Load file ${file} is missing ${key}.`);
  }
  return value;
}

function expectNumberOrNull(record: Record<string, unknown>, key: string, file: string): number | null {
  const value = record[key];
  if (value === null) return null;
  return expectNumber(record, key, file);
}

function parseException(value: unknown, file: string): LoadException {
  if (!isRecord(value)) throw new Error(`Load file ${file} has a bad exception.`);
  const kind = expectString(value, "kind", file);
  if (!isExceptionKind(kind)) throw new Error(`Load file ${file} has an unexpected exception.`);
  return {
    id: expectNumber(value, "id", file),
    kind,
    quantity: expectNumberOrNull(value, "quantity", file),
    notes: expectString(value, "notes", file),
    createdAt: expectString(value, "createdAt", file),
  };
}

function parseLoad(value: unknown, file: string): InboundLoad {
  if (!isRecord(value)) throw new Error(`Load file ${file} is not a load record.`);
  const status = expectString(value, "status", file);
  if (!isLoadStatus(status)) throw new Error(`Load file ${file} has an unexpected status.`);
  const sortRaw = expectStringOrNull(value, "sortOutcome", file);
  let sortOutcome: SortOutcome | null = null;
  if (sortRaw !== null) {
    if (!isSortOutcome(sortRaw)) throw new Error(`Load file ${file} has an unexpected sort outcome.`);
    sortOutcome = sortRaw;
  }
  const exceptionsRaw = value.exceptions;
  if (!Array.isArray(exceptionsRaw)) throw new Error(`Load file ${file} is missing exceptions.`);
  const load: InboundLoad = {
    id: expectNumber(value, "id", file),
    status,
    arrivedAt: expectString(value, "arrivedAt", file),
    carrier: expectString(value, "carrier", file),
    trailerNumber: expectString(value, "trailerNumber", file),
    bolPro: expectString(value, "bolPro", file),
    dockDoor: expectString(value, "dockDoor", file),
    expectedPallets: expectNumber(value, "expectedPallets", file),
    expectedPieces: expectNumber(value, "expectedPieces", file),
    sealNumber: expectString(value, "sealNumber", file),
    references: expectString(value, "references", file),
    driverName: expectString(value, "driverName", file),
    receivingNotes: expectString(value, "receivingNotes", file),
    unloadStartedAt: expectStringOrNull(value, "unloadStartedAt", file),
    unloadedBy: expectStringOrNull(value, "unloadedBy", file),
    unloadFinishedAt: expectStringOrNull(value, "unloadFinishedAt", file),
    receivedPallets: expectNumberOrNull(value, "receivedPallets", file),
    receivedPieces: expectNumberOrNull(value, "receivedPieces", file),
    sortOutcome,
    putawayLocations: expectStringOrNull(value, "putawayLocations", file),
    createdAt: expectString(value, "createdAt", file),
    updatedAt: expectString(value, "updatedAt", file),
    alterationNote: expectStringOrNull(value, "alterationNote", file),
    exceptions: exceptionsRaw.map((exception) => parseException(exception, file)),
  };
  const received = load.status === "received" || load.status === "altered";
  if (
    received &&
    (load.unloadStartedAt === null ||
      load.unloadedBy === null ||
      load.unloadFinishedAt === null ||
      load.receivedPallets === null ||
      load.receivedPieces === null ||
      load.sortOutcome === null ||
      load.putawayLocations === null)
  ) {
    throw new Error(`Load file ${file} is missing receipt details.`);
  }
  if (load.status === "altered" && !load.alterationNote) {
    throw new Error(`Load file ${file} is missing the alteration.`);
  }
  return load;
}

function readLoadFile(dir: string, id: number): InboundLoad | null {
  const file = loadFile(dir, id);
  if (!fs.existsSync(file)) return null;
  return parseLoad(JSON.parse(readText(file)) as unknown, file);
}

function writeLoadFile(dir: string, load: InboundLoad, exclusive = false): void {
  ensureDir(dir);
  const file = loadFile(dir, load.id);
  const body = `${JSON.stringify(load, null, 2)}\n`;
  if (exclusive) {
    fs.writeFileSync(file, body, { encoding: "utf8", flag: "wx" });
    return;
  }
  const temp = path.join(dir, `.${load.id}.${process.pid}.tmp`);
  fs.writeFileSync(temp, body, "utf8");
  fs.renameSync(temp, file);
}

function listLoadFiles(dir: string): InboundLoad[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((name) => /^\d+\.json$/.test(name));
  return names.map((name) => {
    const file = path.join(dir, name);
    return parseLoad(JSON.parse(readText(file)) as unknown, file);
  });
}

function toListItem(load: InboundLoad): LoadListItem {
  return {
    id: load.id,
    status: load.status,
    arrivedAt: load.arrivedAt,
    carrier: load.carrier,
    trailerNumber: load.trailerNumber,
    bolPro: load.bolPro,
    dockDoor: load.dockDoor,
    expectedPallets: load.expectedPallets,
    expectedPieces: load.expectedPieces,
  };
}

function nextLoadId(dir: string): number {
  const loads = listLoadFiles(dir);
  return loads.reduce((max, load) => Math.max(max, load.id), 0) + 1;
}

function requireLoad(dir: string, id: number): InboundLoad {
  const load = readLoadFile(dir, id);
  if (!load) throw new AppError("Load not found.");
  return load;
}

function requireStatus(load: InboundLoad, status: LoadStatus, message: string): void {
  if (load.status !== status) throw new AppError(message);
}

export function createLoad(dir: string, input: ReceivingInput): number {
  const data = normalizeReceiving(input);
  ensureDir(dir);
  const now = nowIso();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = nextLoadId(dir);
    const load: InboundLoad = {
      id,
      status: "new",
      arrivedAt: data.arrivedAt,
      carrier: data.carrier,
      trailerNumber: data.trailerNumber,
      sealNumber: data.sealNumber,
      bolPro: data.bolPro,
      references: data.references,
      dockDoor: data.dockDoor,
      driverName: data.driverName,
      expectedPallets: data.expectedPallets,
      expectedPieces: data.expectedPieces,
      receivingNotes: data.notes,
      unloadStartedAt: null,
      unloadedBy: null,
      unloadFinishedAt: null,
      receivedPallets: null,
      receivedPieces: null,
      sortOutcome: null,
      putawayLocations: null,
      alterationNote: null,
      createdAt: now,
      updatedAt: now,
      exceptions: [],
    };
    try {
      writeLoadFile(dir, load, true);
      return id;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("Could not create a load file.");
}

export function getLoad(dir: string, id: number): InboundLoad | null {
  return readLoadFile(dir, id);
}

export function listLoads(dir: string, filter: LoadListFilter = {}): LoadListItem[] {
  const loads = listLoadFiles(dir).filter((load) => !filter.status || load.status === filter.status);
  const oldestFirst = filter.status === "new" || filter.status === "confirmed" || filter.status === "arrived";
  loads.sort((a, b) => {
    const byTime = a.arrivedAt.localeCompare(b.arrivedAt);
    if (byTime !== 0) return oldestFirst ? byTime : -byTime;
    return oldestFirst ? a.id - b.id : b.id - a.id;
  });
  return loads.map(toListItem);
}

export function loadStats(dir: string): LoadStats {
  const stats: LoadStats = { new: 0, confirmed: 0, arrived: 0, received: 0, altered: 0 };
  for (const load of listLoadFiles(dir)) stats[load.status] += 1;
  return stats;
}

export function confirmLoad(dir: string, id: number): void {
  const load = requireLoad(dir, id);
  requireStatus(load, "new", "Confirm a delivery only while it is New.");
  writeLoadFile(dir, { ...load, status: "confirmed", updatedAt: nowIso() });
}

export function arriveLoad(dir: string, id: number): void {
  const load = requireLoad(dir, id);
  requireStatus(load, "confirmed", "Mark a delivery arrived only after it is Confirmed.");
  writeLoadFile(dir, { ...load, status: "arrived", updatedAt: nowIso() });
}

export function receiveLoad(
  dir: string,
  id: number,
  start: StartUnloadInput,
  input: CompleteUnloadInput,
): void {
  const load = requireLoad(dir, id);
  requireStatus(load, "arrived", "Receive a delivery only after it has Arrived.");
  const started = normalizeStart(start);
  if (new Date(started.startedAt).getTime() < new Date(load.arrivedAt).getTime()) {
    throw new AppError("Unload cannot start before the trailer arrived.");
  }
  const data = normalizeComplete(input, {
    pallets: load.expectedPallets,
    pieces: load.expectedPieces,
  });
  if (new Date(data.finishedAt).getTime() < new Date(started.startedAt).getTime()) {
    throw new AppError("Unload cannot finish before it started.");
  }
  const now = nowIso();
  writeLoadFile(dir, {
    ...load,
    status: "received",
    unloadStartedAt: started.startedAt,
    unloadedBy: started.unloadedBy,
    unloadFinishedAt: data.finishedAt,
    receivedPallets: data.receivedPallets,
    receivedPieces: data.receivedPieces,
    sortOutcome: data.sortOutcome,
    putawayLocations: data.putawayLocations,
    exceptions: data.exceptions.map((exception, index) => ({
      id: index + 1,
      kind: exception.kind,
      quantity: exception.quantity,
      notes: exception.notes,
      createdAt: now,
    })),
    updatedAt: now,
  });
}

export function alterationFromForm(formData: FormData): string {
  return String(formData.get("alterationNote") ?? "");
}

export function alterLoad(dir: string, id: number, note: string): void {
  const load = requireLoad(dir, id);
  requireStatus(load, "received", "Alter a delivery only after it is Received.");
  const alterationNote = requiredText(
    note,
    "Describe what changed.",
    2000,
    "Keep the change under 2000 characters.",
  );
  writeLoadFile(dir, { ...load, status: "altered", alterationNote, updatedAt: nowIso() });
}


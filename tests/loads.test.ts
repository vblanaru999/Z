import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import {
  describeQuantityGap,
  loadProgress,
  type CompleteUnloadInput,
  type ReceivingInput,
  type StartUnloadInput,
} from "../src/lib/load-types";
import {
  completeFromForm,
  completeUnload,
  createLoad,
  getLoad,
  listLoads,
  loadStats,
  receivingFromForm,
  startFromForm,
  startUnload,
} from "../src/lib/loads";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

const receiving: ReceivingInput = {
  arrivedAt: "2026-11-05T13:00:00.000Z",
  carrier: "Northline",
  trailerNumber: "TRL-4412",
  sealNumber: "SL-90821",
  bolPro: "BOL-100293",
  references: "PO 55019\nASN 88310",
  dockDoor: "Door 4",
  driverName: "Chris Hale",
  expectedPallets: 12,
  expectedPieces: 240,
  notes: "Seal intact at the door.",
};

const start: StartUnloadInput = {
  startedAt: "2026-11-05T16:30:00.000Z",
  unloadedBy: "Dana Ruiz",
};

function finish(overrides: Partial<CompleteUnloadInput> = {}): CompleteUnloadInput {
  return {
    finishedAt: "2026-11-05T17:45:00.000Z",
    receivedPallets: 12,
    receivedPieces: 240,
    sortOutcome: "sorted",
    putawayLocations: "A-12-03\nB-04-01",
    exceptions: [],
    ...overrides,
  };
}

function receive(overrides: Partial<ReceivingInput> = {}): number {
  return createLoad(db, { ...receiving, ...overrides });
}

describe("receiving", () => {
  it("saves a waiting load and does not start unloading", () => {
    const id = receive();
    const load = getLoad(db, id);
    expect(load).toMatchObject({
      id,
      status: "waiting",
      carrier: "Northline",
      trailerNumber: "TRL-4412",
      sealNumber: "SL-90821",
      bolPro: "BOL-100293",
      references: "PO 55019\nASN 88310",
      dockDoor: "Door 4",
      driverName: "Chris Hale",
      expectedPallets: 12,
      expectedPieces: 240,
      receivingNotes: "Seal intact at the door.",
      unloadStartedAt: null,
      unloadedBy: null,
      unloadFinishedAt: null,
      receivedPallets: null,
      receivedPieces: null,
      sortOutcome: null,
      putawayLocations: null,
      exceptions: [],
    });
    expect(loadStats(db)).toEqual({ waiting: 1, unloading: 0, done: 0 });
    expect(listLoads(db, { status: "waiting" }).map((load) => load.id)).toEqual([id]);
    expect(loadProgress("waiting").map((step) => [step.key, step.state])).toEqual([
      ["receiving", "complete"],
      ["waiting", "current"],
      ["unloading", "upcoming"],
      ["done", "upcoming"],
    ]);
  });

  it("rejects a receiving record that is missing the practical fields", () => {
    expect(() => receive({ carrier: "  " })).toThrow(AppError);
    expect(() => receive({ references: "\n" })).toThrow(/PO or ASN/);
    expect(() => receive({ expectedPallets: -1 })).toThrow(/expected pallets/);
    expect(() => receive({ expectedPieces: 1.5 })).toThrow(/expected pieces/);
  });

  it("reads the receiving form", () => {
    const form = new FormData();
    form.set("arrivedAt", "2026-11-05T08:30");
    form.set("carrier", " Northline ");
    form.set("trailerNumber", "TRL-4412");
    form.set("sealNumber", "SL-90821");
    form.set("bolPro", "BOL-100293");
    form.set("references", "PO 55019");
    form.set("dockDoor", "Door 4");
    form.set("driverName", "Chris Hale");
    form.set("expectedPallets", "0");
    form.set("expectedPieces", "3");
    form.set("notes", "");
    const input = receivingFromForm(form);
    expect(input.carrier).toBe("Northline");
    expect(input.expectedPallets).toBe(0);
    expect(input.notes).toBe("");
    expect(new Date(input.arrivedAt).getTime()).toBe(new Date("2026-11-05T08:30").getTime());
    form.set("expectedPallets", "12 pallets");
    expect(() => receivingFromForm(form)).toThrow(/expected pallets/);
  });
});

describe("unloading", () => {
  it("starts from the waiting load and then finishes that same load", () => {
    const id = receive();
    expect(() => completeUnload(db, id, finish())).toThrow(/Start unloading/);

    startUnload(db, id, start);
    const unloading = getLoad(db, id);
    expect(unloading).toMatchObject({
      status: "unloading",
      unloadStartedAt: start.startedAt,
      unloadedBy: "Dana Ruiz",
      receivedPallets: null,
    });
    expect(loadProgress("unloading").find((step) => step.key === "unloading")?.state).toBe(
      "current",
    );

    completeUnload(
      db,
      id,
      finish({
        receivedPallets: 11,
        receivedPieces: 250,
        sortOutcome: "partial",
        putawayLocations: "A-12-03\nQC cage",
        exceptions: [
          { kind: "shortage", quantity: 1, notes: "One pallet missing from the nose." },
          { kind: "overage", quantity: 10, notes: "Ten extra pieces on the last pallet." },
          { kind: "damage", quantity: 2, notes: "Two cases crushed." },
        ],
      }),
    );

    const done = getLoad(db, id);
    expect(done?.status).toBe("done");
    expect(done?.receivedPallets).toBe(11);
    expect(done?.receivedPieces).toBe(250);
    expect(done?.sortOutcome).toBe("partial");
    expect(done?.putawayLocations).toBe("A-12-03\nQC cage");
    expect(done?.exceptions.map((exception) => exception.kind)).toEqual([
      "shortage",
      "overage",
      "damage",
    ]);
    expect(describeQuantityGap(12, 240, 11, 250)).toBe("1 pallet short and 10 pieces over.");
    expect(listLoads(db, { status: "waiting" })).toEqual([]);
    expect(listLoads(db, { status: "done" }).map((load) => load.id)).toEqual([id]);
    expect(loadStats(db).done).toBe(1);
    expect(() => startUnload(db, id, start)).toThrow(/already done/);
    expect(() => completeUnload(db, id, finish())).toThrow(/already done/);
  });

  it("requires a shortage or overage only when the counts disagree", () => {
    const matched = receive();
    startUnload(db, matched, start);
    completeUnload(db, matched, finish());
    expect(getLoad(db, matched)?.exceptions).toEqual([]);

    const short = receive({ trailerNumber: "TRL-2" });
    startUnload(db, short, start);
    expect(() => completeUnload(db, short, finish({ receivedPieces: 239 }))).toThrow(/shortage/);
    completeUnload(db, short, finish({
      receivedPieces: 239,
      exceptions: [{ kind: "shortage", quantity: null, notes: "One piece short." }],
    }));

    const over = receive({ trailerNumber: "TRL-3" });
    startUnload(db, over, start);
    expect(() =>
      completeUnload(db, over, finish({
        receivedPallets: 13,
        exceptions: [{ kind: "damage", quantity: 1, notes: "Torn wrap." }],
      })),
    ).toThrow(/overage/);
  });

  it("rejects an unload that starts before arrival or finishes before it started", () => {
    const id = receive();
    expect(() =>
      startUnload(db, id, { ...start, startedAt: "2026-11-05T12:59:00.000Z" }),
    ).toThrow(/before the trailer arrived/);
    startUnload(db, id, start);
    expect(() =>
      completeUnload(db, id, finish({ finishedAt: "2026-11-05T16:00:00.000Z" })),
    ).toThrow(/before it started/);
    expect(getLoad(db, id)?.status).toBe("unloading");
  });

  it("keeps the waiting queue in arrival order", () => {
    const later = receive({ arrivedAt: "2026-11-05T18:00:00.000Z", trailerNumber: "TRL-L" });
    const earlier = receive({ arrivedAt: "2026-11-05T09:00:00.000Z", trailerNumber: "TRL-E" });
    expect(listLoads(db, { status: "waiting" }).map((load) => load.id)).toEqual([earlier, later]);
    startUnload(db, earlier, { ...start, startedAt: "2026-11-05T19:00:00.000Z" });
    expect(listLoads(db, { status: "unloading" }).map((load) => load.trailerNumber)).toEqual([
      "TRL-E",
    ]);
  });

  it("reads the unload forms", () => {
    const startForm = new FormData();
    startForm.set("startedAt", "2026-11-05T11:00");
    startForm.set("unloadedBy", " Dana Ruiz ");
    expect(startFromForm(startForm).unloadedBy).toBe("Dana Ruiz");

    const form = new FormData();
    form.set("finishedAt", "2026-11-05T12:00");
    form.set("receivedPallets", "12");
    form.set("receivedPieces", "240");
    form.set("sortOutcome", "held");
    form.set("putawayLocations", "QC cage");
    form.set("damageNotes", "Crushed corner");
    form.set("damageQuantity", "2");
    form.set("shortageNotes", " ");
    form.set("shortageQuantity", "");
    const input = completeFromForm(form);
    expect(input.sortOutcome).toBe("held");
    expect(input.exceptions).toEqual([
      { kind: "damage", quantity: 2, notes: "Crushed corner" },
    ]);
    form.set("sortOutcome", "lost");
    expect(() => completeFromForm(form)).toThrow(/sorted/);
  });
});

describe("persistence", () => {
  it("keeps a finished load after the database is closed and reopened", () => {
    const file = path.join(os.tmpdir(), `inbound-${process.pid}-${Date.now()}.db`);
    const first = openDatabase(file);
    try {
      const id = createLoad(first, receiving);
      startUnload(first, id, start);
      completeUnload(first, id, finish({
        exceptions: [{ kind: "damage", quantity: null, notes: "Wet carton." }],
      }));
      first.close();

      const second = openDatabase(file);
      try {
        const load = getLoad(second, id);
        expect(load?.status).toBe("done");
        expect(load?.trailerNumber).toBe("TRL-4412");
        expect(load?.putawayLocations).toBe("A-12-03\nB-04-01");
        expect(load?.exceptions).toMatchObject([{ kind: "damage", notes: "Wet carton." }]);
        expect(loadStats(second)).toEqual({ waiting: 0, unloading: 0, done: 1 });
      } finally {
        second.close();
      }
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) {
        fs.rmSync(file + suffix, { force: true });
      }
    }
  });
});

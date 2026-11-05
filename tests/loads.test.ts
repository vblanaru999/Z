import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors";
import {
  describeQuantityGap,
  loadProgress,
  nextStage,
  type CompleteUnloadInput,
  type ReceivingInput,
  type StartUnloadInput,
} from "../src/lib/load-types";
import {
  alterLoad,
  arriveLoad,
  completeFromForm,
  confirmLoad,
  createLoad,
  getLoad,
  listLoads,
  loadStats,
  receiveLoad,
  receivingFromForm,
  startFromForm,
} from "../src/lib/loads";

const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inbound-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
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

function receive(dir: string, overrides: Partial<ReceivingInput> = {}): number {
  return createLoad(dir, { ...receiving, ...overrides });
}

function fileFor(dir: string, id: number): string {
  return path.join(dir, `${id}.json`);
}

describe("new delivery", () => {
  it("saves a New delivery and does not confirm it", () => {
    const dir = tempDir();
    const id = receive(dir);
    const load = getLoad(dir, id);
    expect(load).toMatchObject({
      id,
      status: "new",
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
      alterationNote: null,
      exceptions: [],
    });
    expect(loadStats(dir)).toEqual({ new: 1, confirmed: 0, arrived: 0, received: 0, altered: 0 });
    expect(listLoads(dir, { status: "new" }).map((load) => load.id)).toEqual([id]);
    expect(loadProgress("new").map((step) => [step.key, step.state])).toEqual([
      ["new", "current"],
      ["confirmed", "upcoming"],
      ["arrived", "upcoming"],
      ["received", "upcoming"],
      ["altered", "upcoming"],
    ]);
    expect(nextStage("new")).toBe("confirmed");
    expect(nextStage("altered")).toBeNull();
  });

  it("rejects a record that is missing the practical fields", () => {
    const dir = tempDir();
    expect(() => receive(dir, { carrier: "  " })).toThrow(AppError);
    expect(() => receive(dir, { references: "\n" })).toThrow(/PO or ASN/);
    expect(() => receive(dir, { expectedPallets: -1 })).toThrow(/expected pallets/);
    expect(() => receive(dir, { expectedPieces: 1.5 })).toThrow(/expected pieces/);
  });

  it("reads the delivery form", () => {
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

describe("stages", () => {
  it("moves New, Confirmed, Arrived, Received, then Altered", () => {
    const dir = tempDir();
    const id = receive(dir);
    expect(() => arriveLoad(dir, id)).toThrow(/Confirmed/);
    expect(() => receiveLoad(dir, id, start, finish())).toThrow(/Arrived/);
    expect(() => alterLoad(dir, id, "Count corrected.")).toThrow(/Received/);

    confirmLoad(dir, id);
    expect(getLoad(dir, id)?.status).toBe("confirmed");
    expect(loadProgress("confirmed").find((step) => step.key === "confirmed")?.state).toBe(
      "current",
    );
    expect(() => confirmLoad(dir, id)).toThrow(/New/);

    arriveLoad(dir, id);
    expect(getLoad(dir, id)?.status).toBe("arrived");
    expect(() => confirmLoad(dir, id)).toThrow(/New/);

    receiveLoad(
      dir,
      id,
      start,
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

    const received = getLoad(dir, id);
    expect(received?.status).toBe("received");
    expect(received?.receivedPallets).toBe(11);
    expect(received?.receivedPieces).toBe(250);
    expect(received?.sortOutcome).toBe("partial");
    expect(received?.putawayLocations).toBe("A-12-03\nQC cage");
    expect(received?.unloadedBy).toBe("Dana Ruiz");
    expect(received?.exceptions.map((exception) => exception.kind)).toEqual([
      "shortage",
      "overage",
      "damage",
    ]);
    expect(describeQuantityGap(12, 240, 11, 250)).toBe("1 pallet short and 10 pieces over.");
    expect(listLoads(dir, { status: "arrived" })).toEqual([]);
    expect(listLoads(dir, { status: "received" }).map((load) => load.id)).toEqual([id]);
    expect(() => receiveLoad(dir, id, start, finish())).toThrow(/Arrived/);

    expect(() => alterLoad(dir, id, "   ")).toThrow(/what changed/i);
    alterLoad(dir, id, "Putaway moved from A-12-03 to A-12-04.");
    const altered = getLoad(dir, id);
    expect(altered?.status).toBe("altered");
    expect(altered?.alterationNote).toBe("Putaway moved from A-12-03 to A-12-04.");
    expect(loadStats(dir).altered).toBe(1);
    expect(loadProgress("altered").at(-1)?.state).toBe("current");
    expect(() => alterLoad(dir, id, "Again.")).toThrow(/Received/);
  });

  it("requires a shortage or overage only when the counts disagree", () => {
    const dir = tempDir();
    const matched = receive(dir);
    confirmLoad(dir, matched);
    arriveLoad(dir, matched);
    receiveLoad(dir, matched, start, finish());
    expect(getLoad(dir, matched)?.exceptions).toEqual([]);

    const short = receive(dir, { trailerNumber: "TRL-2" });
    confirmLoad(dir, short);
    arriveLoad(dir, short);
    expect(() => receiveLoad(dir, short, start, finish({ receivedPieces: 239 }))).toThrow(
      /shortage/,
    );
    receiveLoad(
      dir,
      short,
      start,
      finish({
        receivedPieces: 239,
        exceptions: [{ kind: "shortage", quantity: null, notes: "One piece short." }],
      }),
    );

    const over = receive(dir, { trailerNumber: "TRL-3" });
    confirmLoad(dir, over);
    arriveLoad(dir, over);
    expect(() =>
      receiveLoad(
        dir,
        over,
        start,
        finish({
          receivedPallets: 13,
          exceptions: [{ kind: "damage", quantity: 1, notes: "Torn wrap." }],
        }),
      ),
    ).toThrow(/overage/);
  });

  it("rejects an unload that starts before arrival or finishes before it started", () => {
    const dir = tempDir();
    const id = receive(dir);
    confirmLoad(dir, id);
    arriveLoad(dir, id);
    expect(() =>
      receiveLoad(dir, id, { ...start, startedAt: "2026-11-05T12:59:00.000Z" }, finish()),
    ).toThrow(/before the trailer arrived/);
    expect(() =>
      receiveLoad(dir, id, start, finish({ finishedAt: "2026-11-05T16:00:00.000Z" })),
    ).toThrow(/before it started/);
    expect(getLoad(dir, id)?.status).toBe("arrived");
  });

  it("keeps New deliveries in arrival order", () => {
    const dir = tempDir();
    const later = receive(dir, { arrivedAt: "2026-11-05T18:00:00.000Z", trailerNumber: "TRL-L" });
    const earlier = receive(dir, { arrivedAt: "2026-11-05T09:00:00.000Z", trailerNumber: "TRL-E" });
    expect(listLoads(dir, { status: "new" }).map((load) => load.id)).toEqual([earlier, later]);
    confirmLoad(dir, earlier);
    expect(listLoads(dir, { status: "confirmed" }).map((load) => load.trailerNumber)).toEqual([
      "TRL-E",
    ]);
  });

  it("reads the receipt form", () => {
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
    expect(input.exceptions).toEqual([{ kind: "damage", quantity: 2, notes: "Crushed corner" }]);
    form.set("sortOutcome", "lost");
    expect(() => completeFromForm(form)).toThrow(/sorted/);
  });
});

describe("local files", () => {
  it("writes each delivery to its own JSON file and reads that file back", () => {
    const dir = tempDir();
    const id = createLoad(dir, receiving);
    const file = fileFor(dir, id);
    expect(fs.existsSync(file)).toBe(true);
    expect(path.basename(file)).toBe(`${id}.json`);

    const onDisk = JSON.parse(fs.readFileSync(file, "utf8")) as { status: string; trailerNumber: string };
    expect(onDisk).toMatchObject({ status: "new", trailerNumber: "TRL-4412" });

    confirmLoad(dir, id);
    arriveLoad(dir, id);
    receiveLoad(dir, id, start, finish({
      exceptions: [{ kind: "damage", quantity: null, notes: "Wet carton." }],
    }));
    alterLoad(dir, id, "Carton dried and restaged.");

    const reread = JSON.parse(fs.readFileSync(file, "utf8")) as {
      status: string;
      alterationNote: string;
      exceptions: { kind: string; notes: string }[];
    };
    expect(reread.status).toBe("altered");
    expect(reread.alterationNote).toBe("Carton dried and restaged.");
    expect(reread.exceptions).toMatchObject([{ kind: "damage", notes: "Wet carton." }]);

    const load = getLoad(dir, id);
    expect(load?.status).toBe("altered");
    expect(load?.putawayLocations).toBe("A-12-03\nB-04-01");
    expect(loadStats(dir)).toEqual({ new: 0, confirmed: 0, arrived: 0, received: 0, altered: 1 });
    expect(fs.readdirSync(dir).filter((name) => name.endsWith(".json"))).toEqual([`${id}.json`]);
  });
});

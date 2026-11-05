/** One trailer: receiving captures it, then it waits, then unloading finishes it. */
export const LOAD_STATUSES = ["waiting", "unloading", "done"] as const;

export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  waiting: "Waiting",
  unloading: "Unloading",
  done: "Done",
};

export const SORT_OUTCOMES = ["sorted", "partial", "held", "cross_dock"] as const;

export type SortOutcome = (typeof SORT_OUTCOMES)[number];

export const SORT_OUTCOME_LABELS: Record<SortOutcome, string> = {
  sorted: "Sorted to putaway",
  partial: "Partly sorted",
  held: "Held",
  cross_dock: "Cross-dock",
};

export const SORT_OUTCOME_DETAILS: Record<SortOutcome, string> = {
  sorted: "Freight is sorted and going to the locations below.",
  partial: "Some freight is put away. The rest is still outstanding.",
  held: "Freight is not going to a pick slot. Name the hold location.",
  cross_dock: "Freight moves out without reserve putaway.",
};

export const EXCEPTION_KINDS = ["damage", "shortage", "overage"] as const;

export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  damage: "Damage",
  shortage: "Shortage",
  overage: "Overage",
};

export const LOAD_PROGRESS_KEYS = ["receiving", "waiting", "unloading", "done"] as const;

export type LoadProgressKey = (typeof LOAD_PROGRESS_KEYS)[number];

export type StageStepState = "complete" | "current" | "upcoming";

export type LoadProgressStep = {
  key: LoadProgressKey;
  label: string;
  state: StageStepState;
};

const PROGRESS_LABELS: Record<LoadProgressKey, string> = {
  receiving: "Receiving",
  waiting: "Waiting",
  unloading: "Unloading",
  done: "Done",
};

export function isLoadStatus(value: string): value is LoadStatus {
  return (LOAD_STATUSES as readonly string[]).includes(value);
}

export function isSortOutcome(value: string): value is SortOutcome {
  return (SORT_OUTCOMES as readonly string[]).includes(value);
}

export function isExceptionKind(value: string): value is ExceptionKind {
  return (EXCEPTION_KINDS as readonly string[]).includes(value);
}

export function loadProgress(status: LoadStatus): LoadProgressStep[] {
  const currentIndex = status === "waiting" ? 1 : status === "unloading" ? 2 : 3;
  return LOAD_PROGRESS_KEYS.map((key, index) => ({
    key,
    label: PROGRESS_LABELS[key],
    state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming",
  }));
}

export function progressStateLabel(
  step: LoadProgressStep,
  status: LoadStatus,
): string {
  if (step.state === "upcoming") return "Not yet";
  if (step.state === "current" && status === "done") return "Finished";
  if (step.state === "current") return "Current";
  return "Finished";
}

/** How the two stages read on the list. Receiving is captured as soon as the load exists. */
export function stagePair(status: LoadStatus): { receiving: string; unloading: string } {
  return {
    receiving: "Captured",
    unloading:
      status === "waiting" ? "Not started" : status === "unloading" ? "In progress" : "Complete",
  };
}

export function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function describeQuantityGap(
  expectedPallets: number,
  expectedPieces: number,
  receivedPallets: number,
  receivedPieces: number,
): string {
  const palletGap = receivedPallets - expectedPallets;
  const pieceGap = receivedPieces - expectedPieces;
  if (palletGap === 0 && pieceGap === 0) return "Matches the receiving count.";
  const parts: string[] = [];
  if (palletGap < 0) parts.push(countPhrase(-palletGap, "pallet", "pallets") + " short");
  if (palletGap > 0) parts.push(countPhrase(palletGap, "pallet", "pallets") + " over");
  if (pieceGap < 0) parts.push(countPhrase(-pieceGap, "piece", "pieces") + " short");
  if (pieceGap > 0) parts.push(countPhrase(pieceGap, "piece", "pieces") + " over");
  return `${parts.join(" and ")}.`;
}

export type ReceivingInput = {
  arrivedAt: string;
  carrier: string;
  trailerNumber: string;
  sealNumber: string;
  bolPro: string;
  references: string;
  dockDoor: string;
  driverName: string;
  expectedPallets: number;
  expectedPieces: number;
  notes: string;
};

export type StartUnloadInput = {
  startedAt: string;
  unloadedBy: string;
};

export type LoadExceptionInput = {
  kind: ExceptionKind;
  quantity: number | null;
  notes: string;
};

export type CompleteUnloadInput = {
  finishedAt: string;
  receivedPallets: number;
  receivedPieces: number;
  sortOutcome: SortOutcome;
  putawayLocations: string;
  exceptions: LoadExceptionInput[];
};

export type LoadException = {
  id: number;
  kind: ExceptionKind;
  quantity: number | null;
  notes: string;
  createdAt: string;
};

export type LoadListItem = {
  id: number;
  status: LoadStatus;
  arrivedAt: string;
  carrier: string;
  trailerNumber: string;
  bolPro: string;
  dockDoor: string;
  expectedPallets: number;
  expectedPieces: number;
};

export type InboundLoad = LoadListItem & {
  sealNumber: string;
  references: string;
  driverName: string;
  receivingNotes: string;
  unloadStartedAt: string | null;
  unloadedBy: string | null;
  unloadFinishedAt: string | null;
  receivedPallets: number | null;
  receivedPieces: number | null;
  sortOutcome: SortOutcome | null;
  putawayLocations: string | null;
  createdAt: string;
  updatedAt: string;
  exceptions: LoadException[];
};

export type LoadStats = Record<LoadStatus, number>;

export type LoadListFilter = {
  status?: LoadStatus;
};

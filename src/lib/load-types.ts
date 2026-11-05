/** A delivery moves through these stages in order. */
export const LOAD_STATUSES = ["new", "confirmed", "arrived", "received", "altered"] as const;

export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  arrived: "Arrived",
  received: "Received",
  altered: "Altered",
};

/** What the stage means on the list and the delivery page. */
export const STAGE_MEANINGS: Record<LoadStatus, string> = {
  new: "On file, not confirmed yet.",
  confirmed: "The warehouse confirmed this delivery is expected.",
  arrived: "The trailer is at the dock and has not been received.",
  received: "Unloaded, counted, sorted, and put away.",
  altered: "Changed after it was received.",
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

export const LOAD_PROGRESS_KEYS = LOAD_STATUSES;

export type LoadProgressKey = LoadStatus;

export type StageStepState = "complete" | "current" | "upcoming";

export type LoadProgressStep = {
  key: LoadProgressKey;
  label: string;
  state: StageStepState;
};

const PROGRESS_LABELS: Record<LoadProgressKey, string> = LOAD_STATUS_LABELS;

export function isLoadStatus(value: string): value is LoadStatus {
  return (LOAD_STATUSES as readonly string[]).includes(value);
}

export function isSortOutcome(value: string): value is SortOutcome {
  return (SORT_OUTCOMES as readonly string[]).includes(value);
}

export function isExceptionKind(value: string): value is ExceptionKind {
  return (EXCEPTION_KINDS as readonly string[]).includes(value);
}

export function nextStage(status: LoadStatus): LoadStatus | null {
  const index = LOAD_STATUSES.indexOf(status);
  if (index < 0 || index >= LOAD_STATUSES.length - 1) return null;
  return LOAD_STATUSES[index + 1] ?? null;
}

export function loadProgress(status: LoadStatus): LoadProgressStep[] {
  const currentIndex = LOAD_STATUSES.indexOf(status);
  return LOAD_PROGRESS_KEYS.map((key, index) => ({
    key,
    label: PROGRESS_LABELS[key],
    state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming",
  }));
}

export function progressStateLabel(step: LoadProgressStep): string {
  if (step.state === "upcoming") return "Not yet";
  if (step.state === "current") return "Current";
  return "Finished";
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
  alterationNote: string | null;
  exceptions: LoadException[];
};

export type LoadStats = Record<LoadStatus, number>;

export type LoadListFilter = {
  status?: LoadStatus;
};

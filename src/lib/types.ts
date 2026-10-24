/** Statuses a person can move a claim through from the app. */
export const CLAIM_STATUSES = [
  "recorded",
  "warning_sent",
  "fee_applied",
  "resolved",
  "waived",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/**
 * `manual` is the only source this app writes.
 * `xcelerator` is reserved for a later import and is not written here.
 */
export const CLAIM_SOURCES = ["manual", "xcelerator"] as const;

export type ClaimSource = (typeof CLAIM_SOURCES)[number];

export const OPEN_STATUSES: readonly ClaimStatus[] = [
  "recorded",
  "warning_sent",
  "fee_applied",
];

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  recorded: "Recorded",
  warning_sent: "Warning sent",
  fee_applied: "Fee applied",
  resolved: "Resolved",
  waived: "Waived",
};

export const SOURCE_LABELS: Record<ClaimSource, string> = {
  manual: "Manual",
  xcelerator: "Xcelerator",
};

export type FeeBasis = "default" | "claim_type";

export type EmailTransport = "outbox" | "smtp" | "smtp2go";

export type EmailStatus = "saved" | "sent" | "failed";

export type EventKind = "created" | "status_change" | "email";

export function isClaimStatus(value: string): value is ClaimStatus {
  return (CLAIM_STATUSES as readonly string[]).includes(value);
}

export function isClaimSource(value: string): value is ClaimSource {
  return (CLAIM_SOURCES as readonly string[]).includes(value);
}

export function isFeeBasis(value: string): value is FeeBasis {
  return value === "default" || value === "claim_type";
}

export function isEmailStatus(value: string): value is EmailStatus {
  return value === "saved" || value === "sent" || value === "failed";
}

export function isEmailTransport(value: string): value is EmailTransport {
  return value === "outbox" || value === "smtp" || value === "smtp2go";
}

export function isEventKind(value: string): value is EventKind {
  return value === "created" || value === "status_change" || value === "email";
}

/** What the claim screen is allowed to offer for a status. */
export function allowedActions(status: ClaimStatus): {
  sendWarning: boolean;
  applyFee: boolean;
  resolve: boolean;
  waive: boolean;
} {
  return {
    sendWarning: status === "recorded",
    applyFee: status === "warning_sent",
    resolve: status === "fee_applied",
    waive: status === "recorded" || status === "warning_sent",
  };
}

export type ClaimType = {
  id: number;
  code: string;
  label: string;
  description: string;
};

export type DriverFeeInput = {
  claimTypeId: number;
  amountCents: number;
};

export type DriverInput = {
  name: string;
  email: string;
  defaultFeeCents: number;
  typeFees: DriverFeeInput[];
};

export type Driver = {
  id: number;
  name: string;
  email: string;
  defaultFeeCents: number;
  createdAt: string;
  updatedAt: string;
};

export type DriverFee = {
  claimTypeId: number;
  claimTypeLabel: string;
  amountCents: number;
};

export type DriverListItem = Driver & {
  typeFees: DriverFee[];
};

export type ClaimInput = {
  driverId: number;
  claimTypeId: number;
  orderReference: string | null;
  notes: string;
  occurredAt: string;
};

export type ClaimListItem = {
  id: number;
  driverId: number;
  driverName: string;
  claimTypeId: number;
  claimTypeLabel: string;
  orderReference: string | null;
  occurredAt: string;
  status: ClaimStatus;
  source: ClaimSource;
  feeAmountCents: number | null;
};

export type ClaimFilter = {
  driverId?: number;
  claimTypeId?: number;
  status?: ClaimStatus;
  openOnly?: boolean;
};

export type DashboardStats = {
  open: number;
  recorded: number;
  warningSent: number;
  feeApplied: number;
  resolved: number;
  waived: number;
};

export type ClaimEventView = {
  id: number;
  kind: EventKind;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus | null;
  message: string;
  emailId: number | null;
  createdAt: string;
};

export type EmailRecord = {
  id: number;
  claimId: number;
  driverId: number;
  to: string;
  subject: string;
  body: string;
  transport: EmailTransport;
  status: EmailStatus;
  error: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type ClaimDetail = {
  id: number;
  driverId: number;
  driverName: string;
  driverEmail: string;
  claimTypeId: number;
  claimTypeLabel: string;
  claimTypeDescription: string;
  orderReference: string | null;
  notes: string;
  occurredAt: string;
  status: ClaimStatus;
  source: ClaimSource;
  feeAmountCents: number | null;
  feeAppliedAt: string | null;
  feeBasis: FeeBasis | null;
  createdAt: string;
  updatedAt: string;
  contractFeeCents: number;
  contractFeeBasis: FeeBasis;
  defaultFeeCents: number;
  events: ClaimEventView[];
  emails: EmailRecord[];
};

export type RecentEmail = {
  id: number;
  claimId: number;
  to: string;
  subject: string;
  status: EmailStatus;
  transport: EmailTransport;
  createdAt: string;
  error: string | null;
  driverName: string;
};

import type {
  ClaimEventView,
  ClaimFilter,
  ClaimListItem,
  ClaimSource,
  ClaimStatus,
  ClaimType,
  Driver,
  DriverFee,
  DriverListItem,
  EmailRecord,
  EmailStatus,
  EmailTransport,
  EventKind,
  FeeBasis,
  RecentEmail,
} from "./types";

export type DriverRowInput = {
  name: string;
  email: string;
  defaultFeeCents: number;
  createdAt: string;
  updatedAt: string;
};

export type DriverRowPatch = {
  name: string;
  email: string;
  defaultFeeCents: number;
  updatedAt: string;
};

export type ClaimInsert = {
  driverId: number;
  claimTypeId: number;
  orderReference: string | null;
  notes: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ClaimRecord = {
  id: number;
  driverId: number;
  driverName: string;
  driverEmail: string;
  defaultFeeCents: number;
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
  typeFeeCents: number | null;
};

export type ClaimStatusPatch = {
  status: ClaimStatus;
  updatedAt: string;
  feeAmountCents?: number;
  feeAppliedAt?: string;
  feeBasis?: FeeBasis;
};

export type EmailInsert = {
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

export type EventInsert = {
  claimId: number;
  kind: EventKind;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus | null;
  message: string;
  emailId: number | null;
  createdAt: string;
};

/** Persistence for drivers, claim types, claims, emails, and history. */
export type Store = {
  seedClaimTypes(): Promise<void>;
  listClaimTypes(): Promise<ClaimType[]>;
  getClaimType(id: number): Promise<ClaimType | undefined>;

  insertDriver(row: DriverRowInput): Promise<number>;
  updateDriverRow(id: number, row: DriverRowPatch): Promise<void>;
  replaceDriverFees(
    driverId: number,
    fees: { claimTypeId: number; amountCents: number }[],
  ): Promise<void>;
  getDriver(id: number): Promise<Driver | undefined>;
  getDriverByEmail(email: string): Promise<Driver | undefined>;
  listDrivers(): Promise<DriverListItem[]>;
  listDriverFees(driverId: number): Promise<DriverFee[]>;
  typeFeeCents(driverId: number, claimTypeId: number): Promise<number | null>;

  insertClaim(row: ClaimInsert): Promise<number>;
  updateClaimIfStatus(id: number, expected: ClaimStatus, patch: ClaimStatusPatch): Promise<boolean>;
  listClaims(filter: ClaimFilter): Promise<ClaimListItem[]>;
  countClaimsByStatus(): Promise<Partial<Record<ClaimStatus, number>>>;
  getClaimRecord(id: number): Promise<ClaimRecord | undefined>;

  insertEmail(row: EmailInsert): Promise<number>;
  listEmails(claimId: number): Promise<EmailRecord[]>;
  listRecentEmails(limit: number): Promise<RecentEmail[]>;

  insertEvent(row: EventInsert): Promise<void>;
  listEvents(claimId: number): Promise<ClaimEventView[]>;
};

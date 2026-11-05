import {
  EXCEPTION_LABELS,
  LOAD_STATUS_LABELS,
  type ExceptionKind,
  type LoadStatus,
} from "../lib/load-types";
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  type ClaimSource,
  type ClaimStatus,
  type EmailStatus,
} from "../lib/types";

const EMAIL_LABELS: Record<EmailStatus, string> = {
  saved: "In outbox",
  sent: "Sent",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function SourceBadge({ source }: { source: ClaimSource }) {
  return <span className="badge badge-source">{SOURCE_LABELS[source]}</span>;
}

export function EmailBadge({ status }: { status: EmailStatus }) {
  return <span className={`badge badge-${status}`}>{EMAIL_LABELS[status]}</span>;
}

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  return <span className={`badge badge-${status}`}>{LOAD_STATUS_LABELS[status]}</span>;
}

export function ExceptionBadge({ kind }: { kind: ExceptionKind }) {
  return <span className={`badge badge-${kind}`}>{EXCEPTION_LABELS[kind]}</span>;
}

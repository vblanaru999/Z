import { formatMoney } from "./money";
import { formatWhen } from "./format";
import type { FeeBasis } from "./types";

export type WarningEmailInput = {
  claimId: number;
  driverName: string;
  driverEmail: string;
  claimTypeLabel: string;
  occurredAt: string;
  orderReference: string | null;
  notes: string;
  feeAmountCents: number;
  feeBasis: FeeBasis;
  defaultFeeCents: number;
};

export type WarningEmail = {
  to: string;
  subject: string;
  text: string;
};

export type WarningTemplate = {
  subject: string;
  body: string;
};

/** Tokens the warning editor can place. Each one is filled from the claim being sent. */
export const WARNING_PLACEHOLDERS = [
  { token: "{{driver}}", label: "Driver name" },
  { token: "{{claimType}}", label: "What they failed to do" },
  { token: "{{when}}", label: "When it happened, as a date and time" },
  { token: "{{orderReference}}", label: "Order reference, or nothing when the claim has none" },
  { token: "{{orderLine}}", label: "“Order reference: …” on its own line, or nothing" },
  { token: "{{notes}}", label: "What went wrong" },
  { token: "{{feeSentence}}", label: "The contract fee sentence for this claim" },
  { token: "{{fee}}", label: "Contract fee amount" },
  { token: "{{claimId}}", label: "Claim number" },
] as const;

export const DEFAULT_WARNING_SUBJECT = "Warning: {{claimType}}";

export const DEFAULT_WARNING_BODY = [
  "Hello {{driver}},",
  "",
  "This is a formal warning. A delivery procedure was not followed.",
  "",
  "What was not done: {{claimType}}",
  "When: {{when}}",
  "{{orderLine}}What went wrong: {{notes}}",
  "",
  "This message is a warning. It does not apply a fee. Repeated issues can incur the fee in your contract.",
  "{{feeSentence}}",
  "",
  "Reference: claim {{claimId}}",
].join("\n");

const PLACEHOLDER_VALUES = new Set<string>([
  "driver",
  "claimType",
  "when",
  "orderReference",
  "orderLine",
  "notes",
  "feeSentence",
  "fee",
  "claimId",
]);

function feeSentence(input: WarningEmailInput): string {
  const fee = formatMoney(input.feeAmountCents);
  const fallback = formatMoney(input.defaultFeeCents);
  if (input.feeBasis === "claim_type" && fee !== fallback) {
    return `For this kind of issue the contract fee is ${fee}. The default contract fee is ${fallback}.`;
  }
  if (input.feeBasis === "claim_type") {
    return `For this kind of issue the contract fee is ${fee}, the amount set on your contract for this claim type.`;
  }
  return `For this kind of issue the contract fee is the default amount on your contract, ${fee}.`;
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (match, key: string) => {
    if (!PLACEHOLDER_VALUES.has(key)) return match;
    return values[key] ?? "";
  });
}

/** Fill a saved template for one claim. The default template matches the original warning. */
export function renderWarningEmail(
  template: WarningTemplate,
  input: WarningEmailInput,
): WarningEmail {
  const orderLine = input.orderReference ? `Order reference: ${input.orderReference}\n` : "";
  const values = {
    driver: input.driverName,
    claimType: input.claimTypeLabel,
    when: formatWhen(input.occurredAt),
    orderReference: input.orderReference ?? "",
    orderLine,
    notes: input.notes,
    feeSentence: feeSentence(input),
    fee: formatMoney(input.feeAmountCents),
    claimId: String(input.claimId),
  };
  return {
    to: input.driverEmail,
    subject: fillTemplate(template.subject, values).trim(),
    text: fillTemplate(template.body, values),
  };
}

/** Plain warning copy from the seeded template. Preview and send use the saved template. */
export function buildWarningEmail(input: WarningEmailInput): WarningEmail {
  return renderWarningEmail(
    { subject: DEFAULT_WARNING_SUBJECT, body: DEFAULT_WARNING_BODY },
    input,
  );
}

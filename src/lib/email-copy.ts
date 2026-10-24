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

/** Plain warning copy. The same text is previewed in the app and stored on send. */
export function buildWarningEmail(input: WarningEmailInput): WarningEmail {
  const orderLine = input.orderReference
    ? `Order reference: ${input.orderReference}\n`
    : "";
  const text = [
    `Hello ${input.driverName},`,
    "",
    "This is a formal warning. A delivery procedure was not followed.",
    "",
    `What was not done: ${input.claimTypeLabel}`,
    `When: ${formatWhen(input.occurredAt)}`,
    `${orderLine}What went wrong: ${input.notes}`,
    "",
    "This message is a warning. It does not apply a fee. Repeated issues can incur the fee in your contract.",
    feeSentence(input),
    "",
    `Reference: claim ${input.claimId}`,
  ].join("\n");

  return {
    to: input.driverEmail,
    subject: `Warning: ${input.claimTypeLabel}`,
    text,
  };
}

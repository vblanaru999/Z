import { AppError } from "./errors";

const MAX_CENTS = 100_000_000;

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function centsToDollarInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents % 100);
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

export function parseFeeToCents(raw: string, label: string): number {
  const cleaned = raw.trim().replace(/[$,\s]/g, "");
  if (!cleaned) {
    throw new AppError(`Enter ${label}.`);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new AppError(
      `Enter ${label} as a dollar amount with at most two decimal places.`,
    );
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new AppError(`Enter ${label} as a dollar amount with at most two decimal places.`);
  }
  if (cents > MAX_CENTS) {
    throw new AppError(`Enter ${label} of $1,000,000 or less.`);
  }
  return cents;
}

export function parseOptionalFeeToCents(raw: string, label: string): number | null {
  if (!raw.trim()) return null;
  return parseFeeToCents(raw, label);
}

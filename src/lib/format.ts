import { AppError } from "./errors";

export function nowIso(): string {
  return new Date().toISOString();
}

const whenFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const incidentDateFormatUtc = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const incidentDateFormatLocal = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return whenFormat.format(date);
}

function calendarParts(value: string): { year: number; month: number; day: number } | null {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Calendar date for the incident, as YYYY-MM-DD. A date-only value is kept as entered. */
export function parseIncidentDate(raw: string): string {
  const value = raw.trim();
  if (!value) throw new AppError("Enter when this happened.");
  const parts = calendarParts(value);
  if (CALENDAR_DATE.test(value)) {
    if (!parts) throw new AppError("Enter a valid date.");
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("Enter a valid date.");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date only. Calendar dates stay on that day. Older timestamps drop the time of day. */
export function formatIncidentDate(value: string): string {
  const parts = calendarParts(value);
  if (parts) {
    return incidentDateFormatUtc.format(
      new Date(Date.UTC(parts.year, parts.month - 1, parts.day)),
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return incidentDateFormatLocal.format(date);
}

export function localDateInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

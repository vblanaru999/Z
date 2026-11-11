export function nowIso(): string {
  return new Date().toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** mm/dd/yy, such as 11/10/26. */
export function formatClaimDate(date: Date): string {
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${String(date.getFullYear()).slice(-2)}`;
}

/** mm/dd/yy, plus the time when the value stores one. */
export function formatWhen(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return `${month}/${day}/${year.slice(-2)}`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  let hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${formatClaimDate(date)} ${hours}:${pad(date.getMinutes())} ${suffix}`;
}

export function localDateTimeInputValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

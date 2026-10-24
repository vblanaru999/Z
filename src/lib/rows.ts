import type { SQLOutputValue } from "node:sqlite";

export type SqlRow = Record<string, SQLOutputValue>;

export function rowNumber(row: SqlRow, key: string): number {
  const value = row[key];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error(`Expected a number in column ${key}.`);
}

export function rowNumberOrNull(row: SqlRow, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return rowNumber(row, key);
}

export function rowString(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value === "string") return value;
  throw new Error(`Expected text in column ${key}.`);
}

export function rowStringOrNull(row: SqlRow, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new Error(`Expected text in column ${key}.`);
}

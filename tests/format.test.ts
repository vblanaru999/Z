import { describe, expect, it } from "vitest";
import { formatWhen } from "../src/lib/format";

describe("formatWhen", () => {
  it("shows a stored time as mm/dd/yy with the time", () => {
    const iso = "2026-11-10T21:23:00.000Z";
    const date = new Date(iso);
    let hours = date.getHours();
    const suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    expect(formatWhen(iso)).toBe(`${month}/${day}/${year} ${hours}:${minutes} ${suffix}`);
    expect(formatWhen(iso)).not.toMatch(/November|Nov /);
  });

  it("omits the time when only a date is stored", () => {
    expect(formatWhen("2026-11-10")).toBe("11/10/26");
  });
});

import { describe, expect, it } from "vitest";

import {
  addMonths,
  clampDayToMonth,
  daysInMonth,
  formatYearMonth,
  lastDayOfMonthIso,
  monthsBetween,
  parseYearMonth,
  todayInTimeZone,
} from "./dates";

describe("día de pago en meses más cortos", () => {
  it("el 31 cae el último día en los meses de 30", () => {
    expect(clampDayToMonth(31, { year: 2026, month: 11 })).toBe(30);
    expect(clampDayToMonth(31, { year: 2026, month: 4 })).toBe(30);
  });

  it("el 30 y el 31 caen el 28 en febrero, o el 29 si es bisiesto", () => {
    expect(clampDayToMonth(31, { year: 2027, month: 2 })).toBe(28);
    expect(clampDayToMonth(30, { year: 2027, month: 2 })).toBe(28);
    expect(clampDayToMonth(30, { year: 2028, month: 2 })).toBe(29);
  });

  it("no cambia los días que sí existen", () => {
    expect(clampDayToMonth(31, { year: 2026, month: 12 })).toBe(31);
    expect(clampDayToMonth(15, { year: 2027, month: 2 })).toBe(15);
    expect(clampDayToMonth(1, { year: 2027, month: 2 })).toBe(1);
  });

  it("sabe cuántos días tiene cada mes, con los años bisiestos", () => {
    expect(daysInMonth({ year: 2026, month: 1 })).toBe(31);
    expect(daysInMonth({ year: 2100, month: 2 })).toBe(28); // divisible por 100, no bisiesto
    expect(daysInMonth({ year: 2000, month: 2 })).toBe(29); // divisible por 400, bisiesto
  });
});

describe("meses", () => {
  it("cuenta los meses de uno a otro", () => {
    expect(monthsBetween({ year: 2026, month: 11 }, { year: 2027, month: 12 })).toBe(13);
    expect(monthsBetween({ year: 2026, month: 11 }, { year: 2026, month: 11 })).toBe(0);
    expect(monthsBetween({ year: 2026, month: 12 }, { year: 2027, month: 1 })).toBe(1);
    expect(monthsBetween({ year: 2027, month: 3 }, { year: 2026, month: 12 })).toBe(-3);
  });

  it("suma meses cruzando de año", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2026, month: 12 });
    expect(addMonths({ year: 2026, month: 11 }, 2)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 11 }, 14)).toEqual({ year: 2028, month: 1 });
  });

  it("lee y escribe «año-mes»", () => {
    expect(parseYearMonth("2027-12")).toEqual({ year: 2027, month: 12 });
    expect(formatYearMonth({ year: 2027, month: 3 })).toBe("2027-03");
    expect(parseYearMonth("2027-13")).toBeNull();
    expect(parseYearMonth("2027-00")).toBeNull();
    expect(parseYearMonth("diciembre")).toBeNull();
    expect(parseYearMonth("")).toBeNull();
  });

  it("da el último día del mes como fecha", () => {
    expect(lastDayOfMonthIso({ year: 2027, month: 12 })).toBe("2027-12-31");
    expect(lastDayOfMonthIso({ year: 2027, month: 2 })).toBe("2027-02-28");
  });
});

describe("hoy en la zona horaria del usuario", () => {
  it("en Bogotá todavía es el día anterior cuando en UTC ya cambió", () => {
    const now = new Date("2026-12-01T03:30:00Z"); // 10:30 p. m. del 30 de noviembre en Bogotá
    expect(todayInTimeZone("America/Bogota", now)).toEqual({ year: 2026, month: 11, day: 30 });
    expect(todayInTimeZone("UTC", now)).toEqual({ year: 2026, month: 12, day: 1 });
  });
});

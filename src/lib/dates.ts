/** Un mes del calendario. `month` va de 1 (enero) a 12 (diciembre). */
export type YearMonth = { year: number; month: number };
export type CalendarDate = YearMonth & { day: number };

/** Cuántos días tiene un mes. */
export function daysInMonth({ year, month }: YearMonth): number {
  // El día 0 del mes siguiente es el último día de este.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * El día real de un «día del mes» en un mes concreto. Un pago del día 31 cae el 30
 * en los meses de 30 días, y el 28 o 29 en febrero.
 */
export function clampDayToMonth(day: number, yearMonth: YearMonth): number {
  return Math.min(day, daysInMonth(yearMonth));
}

/** Meses del calendario que hay de un mes a otro. De noviembre a diciembre del mismo año: 1. */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/** La fecha de hoy en la zona horaria del usuario, que puede no ser la del servidor. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** «2027-12» → { year: 2027, month: 12 }. Devuelve `null` si no tiene esa forma. */
export function parseYearMonth(text: string): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Último día de un mes, como fecha ISO («2027-12-31»). */
export function lastDayOfMonthIso(yearMonth: YearMonth): string {
  return `${formatYearMonth(yearMonth)}-${String(daysInMonth(yearMonth)).padStart(2, "0")}`;
}

/** El mes que queda `count` meses después. */
export function addMonths({ year, month }: YearMonth, count: number): YearMonth {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

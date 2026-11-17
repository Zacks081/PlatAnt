import { appConfig } from "@/config/app";
import { addMonths, formatYearMonth, type CalendarDate, type YearMonth } from "@/lib/dates";
import type { ExpenseSplit } from "@/lib/onboarding/estimate";

/** Textos que se repiten en el recorrido inicial y en Ajustes. */

export const SPLIT_LABELS: Record<ExpenseSplit, string> = {
  first: "primera quincena",
  second: "segunda quincena",
  half: "mitad y mitad",
};

export function installmentsLeft(count: number): string {
  return count === 1 ? "Falta 1 cuota" : `Faltan ${count} cuotas`;
}

/** «Diciembre de 2027» */
export function monthLabel(
  { year, month }: YearMonth,
  locale: string = appConfig.defaults.locale,
): string {
  const text = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Los meses que se pueden elegir para una meta: de este mes a diez años adelante. */
export function monthOptions(today: YearMonth, count = 121) {
  return Array.from({ length: count }, (_, index) => {
    const month = addMonths(today, index);
    return { value: formatYearMonth(month), label: monthLabel(month) };
  });
}

/** «15 y 30», o «30» si el pago es mensual. */
export function payDaysLabel(payDays: readonly number[]): string {
  return payDays.join(" y ");
}

/** «15 de diciembre de 2027» */
export function formatLongDate(date: CalendarDate, locale: string = appConfig.defaults.locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(date.year, date.month - 1, date.day)),
  );
}

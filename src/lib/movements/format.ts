import { appConfig } from "@/config/app";
import { compareDates, parseIsoDate, type CalendarDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/** Textos de los movimientos que se repiten en el inicio y el historial. */

export type MovementKind = "expense" | "income";

/** «−$18.000» para un gasto, «+$1.200.000» para un ingreso. */
export function signedAmount(kind: MovementKind, amount: number, currency?: string): string {
  return `${kind === "expense" ? "−" : "+"}${formatMoney(amount, { currency })}`;
}

/** «Hoy», «Ayer» o «lun 16 nov» (con el año si no es el actual). */
export function dayLabel(
  isoDate: string,
  today: CalendarDate,
  locale: string = appConfig.defaults.locale,
): string {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;
  if (compareDates(date, today) === 0) return "Hoy";
  const yesterday = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
  if (
    compareDates(date, {
      year: yesterday.getUTCFullYear(),
      month: yesterday.getUTCMonth() + 1,
      day: yesterday.getUTCDate(),
    }) === 0
  ) {
    return "Ayer";
  }
  const text = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: date.year === today.year ? undefined : "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(date.year, date.month - 1, date.day)))
    .replaceAll(".", "")
    .replace(",", "")
    .replace(/ de /g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Para una frase: «hoy», «ayer» o «el vie 13 nov». */
export function onDayLabel(isoDate: string, today: CalendarDate): string {
  const label = dayLabel(isoDate, today);
  if (label === "Hoy" || label === "Ayer") return label.toLowerCase();
  return `el ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export const POCKET_LABELS: Record<string, string> = {
  account: "Cuenta",
  cash: "Efectivo",
  credit_card: "Tarjeta",
};

import { appConfig } from "@/config/app";
import { daysBetween, type CalendarDate } from "@/lib/dates";

/** Cuentas y textos de la quincena en curso. Las cifras las calcula este código, no la IA. */

export const QUINCENA_PATH = "/quincena";

export type PayFrequency = "biweekly" | "monthly";

/** Cómo se llama el período: con pago mensual no hay quincenas, hay meses. */
export const PERIOD_WORDS: Record<
  PayFrequency,
  { title: string; the: string; opened: string; next: string }
> = {
  biweekly: {
    title: "Tu quincena",
    the: "la quincena",
    opened: "Quincena abierta",
    next: "tu próxima quincena",
  },
  monthly: { title: "Tu mes", the: "el mes", opened: "Mes abierto", next: "tu próximo mes" },
};

export type SetAsideTotalsInput = { amount: number; paid_movement_id: string | null };

/**
 * Totales de los apartados de una quincena:
 * - apartado: todo lo que la quincena reservó, pagado o no;
 * - pagado: lo que ya se marcó con «Ya pagué»;
 * - falta: lo apartado que todavía no se ha pagado.
 */
export function setAsideTotals(rows: readonly SetAsideTotalsInput[]) {
  const paidRows = rows.filter((row) => row.paid_movement_id !== null);
  const setAside = rows.reduce((total, row) => total + row.amount, 0);
  const paid = paidRows.reduce((total, row) => total + row.amount, 0);
  return {
    setAside,
    paid,
    pending: setAside - paid,
    count: rows.length,
    paidCount: paidRows.length,
  };
}

/** Cuánto falta para el próximo pago y si ya debería haber llegado. */
export function nextPayStatus(today: CalendarDate, expected: CalendarDate) {
  const days = daysBetween(today, expected);
  return { days, due: days <= 0 };
}

/** «hoy», «mañana» o «en 12 días». */
export function inDaysLabel(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/** «15 de noviembre», sin el año. */
export function dayMonthLabel(
  { year, month, day }: CalendarDate,
  locale: string = appConfig.defaults.locale,
): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** «1 de 3 pagos hechos», «Sin pagos esta vez». */
export function paidCountLabel(paidCount: number, count: number): string {
  if (count === 0) return "Sin pagos apartados";
  if (paidCount === count) return count === 1 ? "Ya está pagado" : "Ya están todos pagados";
  return `${paidCount} de ${count} ${count === 1 ? "pago hecho" : "pagos hechos"}`;
}

import { appConfig } from "@/config/app";
import { addDays, daysBetween, type CalendarDate } from "@/lib/dates";
import type { PayInstance } from "@/lib/pay-periods/schedule";

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

export type SetAsideTotalsInput = {
  amount: number;
  paid_movement_id: string | null;
  prior_amount?: number;
};

/**
 * Totales de los apartados de una quincena:
 * - apartado: todo lo que la quincena reservó, pagado o no;
 * - pagado: lo que ya se marcó con «Ya pagué»;
 * - falta: lo apartado que todavía no se ha pagado;
 * - de antes: la parte de lo apartado que ya estaba apartada con plata de antes de la app (solo
 *   en la primera quincena). No sale de la plata de esta quincena.
 */
export function setAsideTotals(rows: readonly SetAsideTotalsInput[]) {
  const paidRows = rows.filter((row) => row.paid_movement_id !== null);
  const setAside = rows.reduce((total, row) => total + row.amount, 0);
  const paid = paidRows.reduce((total, row) => total + row.amount, 0);
  return {
    setAside,
    paid,
    pending: setAside - paid,
    prior: rows.reduce((total, row) => total + (row.prior_amount ?? 0), 0),
    count: rows.length,
    paidCount: paidRows.length,
  };
}

/**
 * Desde cuántos días antes del pago esperado se pregunta «¿Ya te pagaron?» y se puede
 * registrar. Antes no: así no se registran pagos que todavía no llegan.
 */
export const PAY_WINDOW_DAYS = 3;

/**
 * Cuánto falta para el próximo pago, si ya debería haber llegado (`due`) y si ya se puede
 * registrar (`open`, desde `opensOn`).
 */
export function nextPayStatus(today: CalendarDate, expected: CalendarDate) {
  const days = daysBetween(today, expected);
  return {
    days,
    due: days <= 0,
    open: days <= PAY_WINDOW_DAYS,
    opensOn: addDays(expected, -PAY_WINDOW_DAYS),
  };
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

/**
 * Cómo se llama un pago del calendario, en minúscula y con su artículo: «la segunda quincena
 * de noviembre», o con pago mensual, «el pago de noviembre». Se nombra por la quincena y no
 * por el día, porque el día real puede correrse.
 */
export function payName(
  { year, month, slot }: PayInstance,
  payDays: readonly number[],
  locale: string = appConfig.defaults.locale,
): string {
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  if (payDays.length < 2) return `el pago de ${monthName}`;
  return `la ${slot === 1 ? "primera" : "segunda"} quincena de ${monthName}`;
}

/**
 * El nombre corto, para la fila «Quincena» del formulario: «Segunda de noviembre». Con pago
 * mensual (fila «Mes»), solo el mes: «Noviembre».
 */
export function payOptionLabel(instance: PayInstance, payDays: readonly number[]): string {
  const name = payName(instance, payDays)
    .replace(/^(la|el pago de) /, "")
    .replace(" quincena", "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

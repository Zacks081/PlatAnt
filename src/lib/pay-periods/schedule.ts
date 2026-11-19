import {
  addMonths,
  clampDayToMonth,
  compareDates,
  daysBetween,
  type CalendarDate,
  type YearMonth,
} from "@/lib/dates";
import { previousBusinessDay } from "@/lib/pay-periods/holidays";

/**
 * Calendario de pagos. Cada mes tiene uno o dos pagos, según los días de pago del perfil
 * (por ejemplo, 15 y 30). A cada uno le decimos «pago del calendario»: la primera quincena de
 * noviembre, la segunda de noviembre… Una quincena es la plata de uno de esos pagos, desde el
 * día en que llegó de verdad hasta el siguiente.
 *
 * Cuando el día de pago cae en fin de semana o festivo, la fecha estimada es el día hábil
 * anterior. Los festivos son los de Colombia.
 */

/** Cuál de los pagos del mes: 1 (el primero) o 2 (el segundo). Con pago mensual, siempre 1. */
export type PaySlot = 1 | 2;
export type PayInstance = YearMonth & { slot: PaySlot };

/**
 * Número que ordena los pagos del calendario: uno mayor es un pago posterior.
 * Es el mismo cálculo que hace la base de datos (pay_instance_key).
 */
export function instanceKey({ year, month, slot }: PayInstance): number {
  return (year * 12 + month - 1) * 2 + slot - 1;
}

export function sameInstance(a: PayInstance, b: PayInstance): boolean {
  return instanceKey(a) === instanceKey(b);
}

export function nextInstance(instance: PayInstance, payDays: readonly number[]): PayInstance {
  if (instance.slot < payDays.length) return { ...instance, slot: 2 };
  return { ...addMonths(instance, 1), slot: 1 };
}

export function previousInstance(instance: PayInstance, payDays: readonly number[]): PayInstance {
  if (instance.slot > 1) return { ...instance, slot: 1 };
  return { ...addMonths(instance, -1), slot: payDays.length > 1 ? 2 : 1 };
}

/** El día de pago tal cual, ajustado al mes: un pago del 30 cae el 28 de febrero. */
export function nominalPayDate(instance: PayInstance, payDays: readonly number[]): CalendarDate {
  const day = payDays[Math.min(instance.slot, payDays.length) - 1];
  return { year: instance.year, month: instance.month, day: clampDayToMonth(day, instance) };
}

/** Cuándo se espera el pago: el día de pago, o el hábil anterior si cae en fin de semana o festivo. */
export function estimatedPayDate(instance: PayInstance, payDays: readonly number[]): CalendarDate {
  return previousBusinessDay(nominalPayDate(instance, payDays));
}

/** Los pagos del calendario de varios meses alrededor de una fecha, en orden. */
function instancesAround(date: CalendarDate, payDays: readonly number[]): PayInstance[] {
  const instances: PayInstance[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const month = addMonths(date, offset);
    instances.push({ ...month, slot: 1 });
    if (payDays.length > 1) instances.push({ ...month, slot: 2 });
  }
  return instances;
}

/**
 * El pago del calendario más cercano a una fecha. Si hay empate (justo a mitad de camino),
 * gana el posterior: es más común que el pago llegue antes que tarde.
 */
export function nearestInstance(date: CalendarDate, payDays: readonly number[]): PayInstance {
  let best: PayInstance | null = null;
  let bestDistance = Infinity;
  for (const instance of instancesAround(date, payDays)) {
    const distance = Math.abs(daysBetween(estimatedPayDate(instance, payDays), date));
    if (distance <= bestDistance) {
      best = instance;
      bestDistance = distance;
    }
  }
  return best!;
}

export type PayMatch = {
  /** El pago del calendario que se registra. */
  instance: PayInstance;
  /**
   * Si la fecha queda más cerca de un pago que ya se registró, ese pago: puede ser un
   * registro repetido, así que se pregunta antes de abrir otra quincena.
   */
  duplicateOf: PayInstance | null;
};

/**
 * A qué pago del calendario corresponde un pago que llegó en `date`:
 * - Si ya hay pagos registrados, es el que sigue al último (`last`), llegue antes o después.
 *   Solo si la fecha ya alcanzó al pago de después, se toma el más cercano a la fecha: hubo
 *   un pago que no se registró.
 * - Antes del primero, es el que se está esperando: el primero que no ha pasado en esa fecha.
 *   Es el mismo que anuncia Inicio («lo esperamos el…»).
 * Si la fecha queda más cerca del último pago registrado que del nuevo, puede ser un registro
 * repetido: se pide confirmar.
 */
export function matchPay(
  date: CalendarDate,
  last: PayInstance | null,
  payDays: readonly number[],
): PayMatch {
  if (!last) return { instance: upcomingInstance(date, payDays), duplicateOf: null };
  const nearest = nearestInstance(date, payDays);
  const following = nextInstance(last, payDays);
  const skipped =
    compareDates(date, estimatedPayDate(nextInstance(following, payDays), payDays)) >= 0;
  return {
    instance: skipped ? nearest : following,
    duplicateOf: instanceKey(nearest) <= instanceKey(last) ? last : null,
  };
}

/**
 * Entre qué pagos se puede elegir al registrar uno: el sugerido, el de antes (si no está
 * registrado ya) y el de después. Si se saltó algún pago, también los que faltan.
 */
export function payOptions(
  date: CalendarDate,
  last: PayInstance | null,
  payDays: readonly number[],
): { suggested: PayInstance; options: PayInstance[] } {
  const suggested = matchPay(date, last, payDays).instance;
  const end = instanceKey(nextInstance(suggested, payDays));
  const options: PayInstance[] = [];
  let current = last ? nextInstance(last, payDays) : previousInstance(suggested, payDays);
  while (instanceKey(current) <= end) {
    options.push(current);
    current = nextInstance(current, payDays);
  }
  return { suggested, options: options.slice(-4) };
}

/**
 * Cuándo se espera el pago que sigue a `instance`. Si por un pago muy atrasado esa fecha ya
 * pasó (`receivedOn`), se toma el siguiente pago que todavía no haya pasado.
 */
export function expectedEnd(
  instance: PayInstance,
  receivedOn: CalendarDate,
  payDays: readonly number[],
): CalendarDate {
  let next = nextInstance(instance, payDays);
  while (compareDates(estimatedPayDate(next, payDays), receivedOn) <= 0) {
    next = nextInstance(next, payDays);
  }
  return estimatedPayDate(next, payDays);
}

/** El primer pago del calendario que todavía no ha pasado en esa fecha (puede ser ese día). */
function upcomingInstance(date: CalendarDate, payDays: readonly number[]): PayInstance {
  return instancesAround(date, payDays).find(
    (instance) => compareDates(estimatedPayDate(instance, payDays), date) >= 0,
  )!;
}

/** Antes de la primera quincena: el próximo pago que se espera desde hoy (puede ser hoy). */
export function upcomingPay(today: CalendarDate, payDays: readonly number[]): CalendarDate {
  return estimatedPayDate(upcomingInstance(today, payDays), payDays);
}

/** El pago del calendario guardado en la base de datos (mes como «2026-11-01» y número de pago). */
export function instanceFromRow(row: { pay_month: string; pay_slot: number }): PayInstance {
  const [year, month] = row.pay_month.split("-").map(Number);
  return { year, month, slot: row.pay_slot === 2 ? 2 : 1 };
}

/** El mes del pago como lo guarda la base de datos: el primer día del mes. */
export function payMonthIso({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

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
 * (por ejemplo, 15 y 30). A cada uno le decimos «pago del calendario»: el pago del 15 de
 * noviembre, el del 30 de noviembre… Una quincena es la plata de uno de esos pagos, desde el
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
 * A qué pago del calendario corresponde un pago que llegó en `date`. Es el más cercano a esa
 * fecha, así que un pago adelantado o atrasado unos días se reconoce igual. Si ya se registró
 * ese mismo pago (`last`), se propone el siguiente, pero hay que confirmarlo.
 */
export function matchPay(
  date: CalendarDate,
  last: PayInstance | null,
  payDays: readonly number[],
): PayMatch {
  const nearest = nearestInstance(date, payDays);
  if (!last || instanceKey(nearest) > instanceKey(last)) {
    return { instance: nearest, duplicateOf: null };
  }
  return { instance: nextInstance(last, payDays), duplicateOf: last };
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

/** Antes de la primera quincena: el próximo pago que se espera desde hoy (puede ser hoy). */
export function upcomingPay(today: CalendarDate, payDays: readonly number[]): CalendarDate {
  const upcoming = instancesAround(today, payDays)
    .map((instance) => estimatedPayDate(instance, payDays))
    .find((date) => compareDates(date, today) >= 0);
  return upcoming!;
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

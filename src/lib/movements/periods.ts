import {
  addDays,
  addMonths,
  clampDayToMonth,
  daysBetween,
  formatIsoDate,
  lastDayOfMonthIso,
  parseIsoDate,
  type CalendarDate,
} from "@/lib/dates";

/** Filtros de fecha del historial. */
export const PERIODS = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "esta-quincena", label: "Esta quincena" },
  { value: "quincena-pasada", label: "Quincena pasada" },
  { value: "este-mes", label: "Este mes" },
  { value: "mes-pasado", label: "Mes pasado" },
  { value: "personalizado", label: "Fechas personalizadas" },
] as const;

export type Period = (typeof PERIODS)[number]["value"];

/** Sin filtro de fecha, el historial muestra solo estos meses hacia atrás. */
export const DEFAULT_MONTHS = 3;

/** Lo más largo que puede ser un rango de fechas personalizado. */
export const MAX_CUSTOM_DAYS = 30;

export type DateRange = { from: string; to: string };

/**
 * La quincena actual y la anterior según el calendario, con los días de pago del usuario
 * (por ejemplo, 15 y 30). Se usa solo mientras no haya quincenas registradas con «Me pagaron».
 */
function payPeriods(today: CalendarDate, payDays: readonly number[]) {
  const [first, second] = payDays;
  const payDay = (month: { year: number; month: number }, day: number): CalendarDate => ({
    ...month,
    day: clampDayToMonth(day, month),
  });
  const thisMonth = { year: today.year, month: today.month };
  const lastMonth = addMonths(thisMonth, -1);
  const firstThisMonth = payDay(thisMonth, first);
  const secondThisMonth = payDay(thisMonth, second);

  let currentStart: CalendarDate;
  let previousStart: CalendarDate;
  if (today.day >= secondThisMonth.day) {
    currentStart = secondThisMonth;
    previousStart = firstThisMonth;
  } else if (today.day >= firstThisMonth.day) {
    currentStart = firstThisMonth;
    previousStart = payDay(lastMonth, second);
  } else {
    currentStart = payDay(lastMonth, second);
    previousStart = payDay(lastMonth, first);
  }
  return {
    current: { from: formatIsoDate(currentStart), to: formatIsoDate(today) },
    previous: {
      from: formatIsoDate(previousStart),
      to: formatIsoDate(addDays(currentStart, -1)),
    },
  };
}

/** Cuándo empezaron la quincena en curso y la anterior, según los pagos registrados. */
export type RegisteredPeriods = { current: string; previous: string | null };

/**
 * El rango de fechas de un filtro. Sin filtro (`null`), los últimos tres meses: lo anterior
 * no se borra (sirve para los informes), pero se busca con las fechas personalizadas.
 * Un rango personalizado inválido (al revés o de más de 30 días) devuelve un error para mostrar.
 * Las quincenas van desde el día en que llegó cada pago, si ya hay pagos registrados.
 */
export function periodRange(
  period: Period | null,
  today: CalendarDate,
  payDays: readonly number[],
  custom: { from: string | null; to: string | null },
  registered: RegisteredPeriods | null = null,
): { range: DateRange | null; error?: string } {
  const iso = formatIsoDate;
  const thisMonth = { year: today.year, month: today.month };
  switch (period) {
    case "hoy":
      return { range: { from: iso(today), to: iso(today) } };
    case "ayer": {
      const yesterday = iso(addDays(today, -1));
      return { range: { from: yesterday, to: yesterday } };
    }
    case "esta-quincena":
      if (registered) return { range: { from: registered.current, to: iso(today) } };
      return { range: payDays.length === 2 ? payPeriods(today, payDays).current : null };
    case "quincena-pasada":
      if (registered?.previous) {
        const end = addDays(parseIsoDate(registered.current)!, -1);
        return { range: { from: registered.previous, to: iso(end) } };
      }
      return { range: payDays.length === 2 ? payPeriods(today, payDays).previous : null };
    case "este-mes":
      return { range: { from: iso({ ...thisMonth, day: 1 }), to: iso(today) } };
    case "mes-pasado": {
      const last = addMonths(thisMonth, -1);
      return { range: { from: iso({ ...last, day: 1 }), to: lastDayOfMonthIso(last) } };
    }
    case "personalizado": {
      const from = custom.from ? parseIsoDate(custom.from) : null;
      const to = custom.to ? parseIsoDate(custom.to) : null;
      if (!from || !to) return { range: null };
      const days = daysBetween(from, to);
      if (days < 0) return { range: null, error: "La fecha final va antes de la inicial." };
      if (days >= MAX_CUSTOM_DAYS) {
        return { range: null, error: `El rango puede ser de máximo ${MAX_CUSTOM_DAYS} días.` };
      }
      return { range: { from: iso(from), to: iso(to) } };
    }
    default: {
      const start = addMonths(thisMonth, -DEFAULT_MONTHS);
      const from = { ...start, day: clampDayToMonth(today.day, start) };
      return { range: { from: iso(from), to: iso(today) } };
    }
  }
}

/** Tipos de movimiento del filtro del historial. */
export const MOVEMENT_TYPES = [
  { value: "gasto", label: "Gastos" },
  { value: "ingreso", label: "Ingresos" },
  { value: "retiro", label: "Retiros" },
  { value: "consignacion", label: "Consignaciones" },
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number]["value"];

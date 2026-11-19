import { addDays, formatIsoDate, weekday, type CalendarDate } from "@/lib/dates";

/**
 * Festivos de Colombia (Ley 51 de 1983, «Ley Emiliani»). Hay tres clases:
 * - fijos: se celebran el día que son, caigan cuando caigan;
 * - trasladables: si no caen en lunes, pasan al lunes siguiente;
 * - de Semana Santa: dependen de la fecha de la Pascua, y algunos también pasan al lunes.
 */

/** Domingo de Pascua (calendario gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/** El mismo día si es lunes; si no, el lunes siguiente. */
function nextMonday(date: CalendarDate): CalendarDate {
  const day = weekday(date);
  return day === 0 ? date : addDays(date, 7 - day);
}

const FIXED: readonly [month: number, day: number][] = [
  [1, 1], // Año Nuevo
  [5, 1], // Día del Trabajo
  [7, 20], // Independencia
  [8, 7], // Batalla de Boyacá
  [12, 8], // Inmaculada Concepción
  [12, 25], // Navidad
];

const MOVABLE: readonly [month: number, day: number][] = [
  [1, 6], // Reyes Magos
  [3, 19], // San José
  [6, 29], // San Pedro y San Pablo
  [8, 15], // Asunción de la Virgen
  [10, 12], // Día de la Raza
  [11, 1], // Todos los Santos
  [11, 11], // Independencia de Cartagena
];

const cache = new Map<number, ReadonlySet<string>>();

/** Los festivos de un año, como fechas ISO («2026-11-16»). */
export function colombianHolidays(year: number): ReadonlySet<string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const dates: CalendarDate[] = [
    ...FIXED.map(([month, day]) => ({ year, month, day })),
    ...MOVABLE.map(([month, day]) => nextMonday({ year, month, day })),
    addDays(easter, -3), // Jueves Santo
    addDays(easter, -2), // Viernes Santo
    addDays(easter, 43), // Ascensión del Señor (jueves 39 días después, pasa al lunes)
    addDays(easter, 64), // Corpus Christi (jueves 60 días después, pasa al lunes)
    addDays(easter, 71), // Sagrado Corazón (viernes 68 días después, pasa al lunes)
  ];
  const holidays = new Set(dates.map(formatIsoDate));
  cache.set(year, holidays);
  return holidays;
}

export function isHoliday(date: CalendarDate): boolean {
  return colombianHolidays(date.year).has(formatIsoDate(date));
}

/** Día hábil: de lunes a viernes y que no sea festivo. */
export function isBusinessDay(date: CalendarDate): boolean {
  return weekday(date) < 5 && !isHoliday(date);
}

/** El mismo día si es hábil; si no, el día hábil anterior. */
export function previousBusinessDay(date: CalendarDate): CalendarDate {
  let day = date;
  while (!isBusinessDay(day)) day = addDays(day, -1);
  return day;
}

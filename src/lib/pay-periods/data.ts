import "server-only";

import type { CurrentUser } from "@/lib/auth/session";
import { parseIsoDate, todayInTimeZone } from "@/lib/dates";
import type { Db } from "@/lib/movements/data";
import { upcomingPay } from "@/lib/pay-periods/schedule";
import { nextPayStatus, setAsideTotals } from "@/lib/pay-periods/summary";

/** Lectura de quincenas y apartados, con la sesión del usuario. */

const PERIOD_FIELDS =
  "id, pay_month, pay_slot, started_on, amount_received, expected_end_on, movement_id" as const;

/** Las últimas quincenas, de la más reciente a la más vieja. La primera es la que está en curso. */
export async function getRecentPeriods(db: Db, limit = 1) {
  const { data, error } = await db
    .from("pay_periods")
    .select(PERIOD_FIELDS)
    .order("pay_month", { ascending: false })
    .order("pay_slot", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`No se pudieron cargar las quincenas: ${error.message}`);
  return data;
}

export async function getCurrentPeriod(db: Db) {
  return (await getRecentPeriods(db, 1))[0] ?? null;
}

export type PayPeriodRow = NonNullable<Awaited<ReturnType<typeof getCurrentPeriod>>>;

async function getSetAsides(db: Db, periodId: string) {
  const { data, error } = await db
    .from("set_asides")
    .select("id, amount, due_on, paid_movement_id, fixed_expenses(name, amount, categories(icon))")
    .eq("pay_period_id", periodId)
    .order("due_on")
    .order("created_at");
  if (error) throw new Error(`No se pudieron cargar los apartados: ${error.message}`);
  return data;
}

export type SetAsideRow = Awaited<ReturnType<typeof getSetAsides>>[number];

/**
 * La quincena en curso con sus apartados y cuándo se espera el próximo pago. Antes del primer
 * «Me pagaron» no hay quincena: solo la fecha en que se espera el pago.
 */
export async function getPayOverview(db: Db, user: CurrentUser) {
  const today = todayInTimeZone(user.timeZone);
  const period = await getCurrentPeriod(db);
  const setAsides = period ? await getSetAsides(db, period.id) : [];
  const expected = period
    ? parseIsoDate(period.expected_end_on)!
    : upcomingPay(today, user.payDays);

  return {
    today,
    period,
    setAsides,
    totals: setAsideTotals(setAsides),
    next: { date: expected, ...nextPayStatus(today, expected) },
  };
}

import "server-only";

import type { CurrentUser } from "@/lib/auth/session";
import { parseIsoDate, todayInTimeZone } from "@/lib/dates";
import type { Db } from "@/lib/movements/data";
import { upcomingPay } from "@/lib/pay-periods/schedule";
import { quincenaPocketTotals } from "@/lib/pockets/fixed";
import { getFixedPockets } from "@/lib/pockets/fixed-data";
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
    .select(
      "id, fixed_expense_id, amount, prior_amount, due_on, paid_movement_id, paid:movements!set_asides_user_id_paid_movement_id_fkey(amount, occurred_on), fixed_expenses(name, amount, categories(icon))",
    )
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
  const [setAsides, pockets] = await Promise.all([
    period ? getSetAsides(db, period.id) : [],
    getFixedPockets(db),
  ]);
  const expected = period
    ? parseIsoDate(period.expected_end_on)!
    : upcomingPay(today, user.payDays);

  const items = fixedExpenseItems(setAsides, pockets);
  return {
    today,
    period,
    setAsides,
    items,
    pocketTotals: quincenaPocketTotals(items),
    totals: setAsideTotals(setAsides),
    next: { date: expected, ...nextPayStatus(today, expected) },
  };
}

/**
 * Los gastos fijos de la quincena, uno por gasto (aunque «mitad y mitad» tenga dos partes):
 * cuándo vence, su valor, cuánto tiene su bolsillo y si ya se pagó.
 */
function fixedExpenseItems(
  setAsides: readonly SetAsideRow[],
  pockets: Awaited<ReturnType<typeof getFixedPockets>>,
) {
  const byFixed = new Map<string, SetAsideRow[]>();
  for (const row of setAsides) {
    if (!row.fixed_expense_id) continue;
    byFixed.set(row.fixed_expense_id, [...(byFixed.get(row.fixed_expense_id) ?? []), row]);
  }
  const items = [...byFixed.entries()].map(([fixedExpenseId, rows]) => {
    const pocket = pockets.get(fixedExpenseId);
    const paid = rows.every((row) => row.paid) ? rows[0].paid : null;
    return {
      fixedExpenseId,
      name: rows[0].fixed_expenses?.name ?? pocket?.fixed.name ?? "Gasto fijo",
      icon: rows[0].fixed_expenses?.categories?.icon ?? null,
      dueOn: rows[0].due_on,
      total: rows[0].fixed_expenses?.amount ?? 0,
      balance: pocket?.balance ?? 0,
      hasPocket: pocket !== undefined,
      paidAmount: paid?.amount ?? null,
      paidOn: paid?.occurred_on ?? null,
    };
  });
  // Por fecha de vencimiento y, el mismo día, por nombre.
  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name, "es"));
}

export type FixedExpenseItem = ReturnType<typeof fixedExpenseItems>[number];

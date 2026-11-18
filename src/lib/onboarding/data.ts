import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import {
  compareDates,
  parseIsoDate,
  parseYearMonth,
  todayInTimeZone,
  type CalendarDate,
  type YearMonth,
} from "@/lib/dates";
import {
  estimateFreeMoney,
  goalMonthlyContribution,
  payPeriodForDay,
  type Estimate,
} from "@/lib/onboarding/estimate";
import { canOpenStep, currentPath, type StepNumber } from "@/lib/onboarding/steps";
import { createClient } from "@/lib/supabase/server";

/**
 * Lectura de lo que el usuario registró en la configuración inicial.
 * Todo pasa por el cliente con su sesión, así que la base de datos solo entrega sus filas.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Result<T> = { data: T; error: { message: string } | null };

/** Si la base de datos falla, que se note: mejor un error que mostrar datos a medias. */
function fail(message: string): never {
  throw new Error(`No se pudieron cargar los datos: ${message}`);
}

/** Resultado de una consulta de varias filas. */
function many<T>(result: Result<T>): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    fail(result.error?.message ?? "sin respuesta");
  }
  return result.data as NonNullable<T>;
}

/** Resultado de una consulta de una sola fila, que puede no existir. */
function oneOrNone<T>(result: Result<T>): T {
  if (result.error) fail(result.error.message);
  return result.data;
}

/**
 * Lo primero que hace cada pantalla del recorrido: comprobar la sesión y que la persona
 * pueda abrir ese paso. Quien intenta saltarse pasos vuelve al que le toca.
 */
export async function openStep(step: StepNumber): Promise<{ user: CurrentUser; db: Supabase }> {
  const user = await getCurrentUser();
  if (!canOpenStep(step, user)) redirect(currentPath(user));
  return { user, db: await createClient() };
}

export async function getCategories(db: Supabase, kind: "expense" | "income") {
  const categories = many(
    await db
      .from("categories")
      .select("id, name")
      .eq("kind", kind)
      .is("archived_at", null)
      .order("name"),
  );
  // En orden alfabético, con «Otros» al final.
  const isOther = (name: string) => name === "Otros" || name === "Otros ingresos";
  return [
    ...categories.filter((category) => !isOther(category.name)),
    ...categories.filter((category) => isOther(category.name)),
  ];
}

/** Saldo inicial de cada bolsillo (0 si no tiene). */
export async function getOpeningBalances(db: Supabase) {
  const openings = many(
    await db
      .from("movements")
      .select("amount, pockets!movements_user_id_pocket_id_fkey(kind)")
      .eq("origin", "opening_balance"),
  );
  const balances = { account: 0, cash: 0, credit_card: 0 };
  for (const opening of openings) {
    const kind = opening.pockets?.kind;
    if (kind) balances[kind] = opening.amount;
  }
  return balances;
}

export async function getFixedExpenses(db: Supabase) {
  return many(
    await db
      .from("fixed_expenses")
      .select("id, name, amount, due_day, split, category_id")
      .eq("active", true)
      .order("due_day")
      .order("name"),
  );
}

export async function getCard(db: Supabase) {
  const card = oneOrNone(
    await db
      .from("credit_cards")
      .select("id, statement_day, payment_day, monthly_rate, rate_is_estimated, split")
      .maybeSingle(),
  );
  if (!card) return null;
  const plans = many(
    await db
      .from("installment_plans")
      .select("id, name, kind, principal, installments_count")
      .eq("credit_card_id", card.id)
      // Solo lo que se debía antes de usar la app; las compras nuevas vienen de los gastos.
      .eq("is_initial", true)
      .order("created_at"),
  );
  return { ...card, plans };
}

export async function getDebts(db: Supabase) {
  return many(
    await db
      .from("debts")
      .select(
        "id, name, original_amount, installment_amount, payment_day, installments_remaining, payment_type, due_date, split",
      )
      .is("closed_at", null)
      .order("created_at"),
  );
}

/** Las metas sin cumplir, de la más antigua a la más nueva. */
export async function getGoals(db: Supabase) {
  return many(
    await db
      .from("goals")
      .select("id, name, target_amount, target_date, split")
      .is("achieved_at", null)
      .order("created_at"),
  );
}

/** Lo que se debe en la tarjeta: la suma de compras y avances. Los planes mensuales no son deuda. */
export function cardDebt(plans: readonly { kind: string; principal: number }[]): number {
  return plans
    .filter((plan) => plan.kind !== "subscription")
    .reduce((total, plan) => total + plan.principal, 0);
}

/** «2027-12-31» → { year: 2027, month: 12 } */
export function yearMonthOfDate(isoDate: string): YearMonth {
  return parseYearMonth(isoDate.slice(0, 7)) as YearMonth;
}

export type Summary = {
  estimate: Estimate;
  balances: Awaited<ReturnType<typeof getOpeningBalances>>;
  fixedExpenses: Awaited<ReturnType<typeof getFixedExpenses>>;
  card: Awaited<ReturnType<typeof getCard>>;
  debts: Awaited<ReturnType<typeof getDebts>>;
  goals: Awaited<ReturnType<typeof getGoals>>;
  /** Lo que se aparta al mes para metas. */
  goalMonthly: number;
  /** Pagos únicos pendientes, del más cercano al más lejano. No entran en lo libre de cada mes. */
  pendingPayments: PendingPayment[];
};

export type PendingPayment = {
  name: string;
  amount: number;
  date: CalendarDate;
  /** Lo libre que quedaría en la quincena (o el mes) en que cae, después de pagarlo. */
  freeAfter: number;
  period: "first" | "second" | "month";
};

/** Todo lo registrado, con el estimado de plata libre ya calculado. */
export async function getSummary(db: Supabase, user: CurrentUser): Promise<Summary> {
  const [balances, fixedExpenses, card, debts, goals] = await Promise.all([
    getOpeningBalances(db),
    getFixedExpenses(db),
    getCard(db),
    getDebts(db),
    getGoals(db),
  ]);
  const today = todayInTimeZone(user.timeZone);

  const goalContributions = goals.map((goal) => ({
    monthly: goalMonthlyContribution({
      targetAmount: goal.target_amount,
      target: yearMonthOfDate(goal.target_date),
      today,
    }),
    split: goal.split,
  }));

  const estimate = estimateFreeMoney({
    monthlyIncome: user.monthlyIncome ?? 0,
    payFrequency: user.payFrequency,
    payDays: user.payDays,
    fixedExpenses,
    // Lo libre «de un mes normal» solo cuenta lo que se repite: las cuotas mensuales.
    // Los pagos únicos se muestran aparte (ver pendingPayments).
    debts: debts
      .filter((debt) => debt.payment_type === "monthly")
      .map((debt) => ({
        installmentAmount: debt.installment_amount,
        paymentDay: debt.payment_day,
        split: debt.split,
      })),
    card: card
      ? {
          split: card.split,
          monthlyRate: Number(card.monthly_rate),
          plans: card.plans.map((plan) => ({
            kind: plan.kind,
            principal: plan.principal,
            installmentsCount: plan.installments_count,
          })),
        }
      : null,
    goals: goalContributions,
  });

  const pendingPayments: PendingPayment[] = debts
    .filter((debt) => debt.payment_type === "single" && debt.due_date !== null)
    .map((debt) => {
      const date = parseIsoDate(debt.due_date!)!;
      const period = estimate.periods
        ? payPeriodForDay(date.day, user.payDays)
        : ("month" as const);
      const freeBefore = estimate.periods
        ? estimate.periods[period as "first" | "second"]
        : estimate.free;
      return {
        name: debt.name,
        amount: debt.original_amount,
        date,
        period,
        freeAfter: freeBefore - debt.original_amount,
      };
    })
    .sort((a, b) => compareDates(a.date, b.date));

  return {
    estimate,
    balances,
    fixedExpenses,
    card,
    debts,
    goals,
    goalMonthly: estimate.goal,
    pendingPayments,
  };
}

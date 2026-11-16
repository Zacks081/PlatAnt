import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { parseYearMonth, todayInTimeZone, type YearMonth } from "@/lib/dates";
import {
  estimateFreeMoney,
  goalContributionPerPayment,
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
  return many(
    await db
      .from("categories")
      .select("id, name")
      .eq("kind", kind)
      .is("archived_at", null)
      .order("created_at")
      .order("name"),
  );
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
      .select("id, statement_day, payment_day, monthly_rate, rate_is_estimated")
      .maybeSingle(),
  );
  if (!card) return null;
  const plans = many(
    await db
      .from("installment_plans")
      .select("id, name, kind, principal, installments_count")
      .eq("credit_card_id", card.id)
      .order("created_at"),
  );
  return { ...card, plans };
}

export async function getDebts(db: Supabase) {
  return many(
    await db
      .from("debts")
      .select("id, name, original_amount, installment_amount, payment_day, installments_remaining")
      .is("closed_at", null)
      .order("created_at"),
  );
}

/** La meta del recorrido: la más antigua sin cumplir. */
export async function getGoal(db: Supabase) {
  return oneOrNone(
    await db
      .from("goals")
      .select("id, name, target_amount, target_date")
      .is("achieved_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  );
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
  goal: Awaited<ReturnType<typeof getGoal>>;
  goalPerPayment: number;
};

/** Todo lo registrado, con el estimado de plata libre ya calculado. */
export async function getSummary(db: Supabase, user: CurrentUser): Promise<Summary> {
  const [balances, fixedExpenses, card, debts, goal] = await Promise.all([
    getOpeningBalances(db),
    getFixedExpenses(db),
    getCard(db),
    getDebts(db),
    getGoal(db),
  ]);

  const goalPerPayment = goal
    ? goalContributionPerPayment({
        targetAmount: goal.target_amount,
        target: yearMonthOfDate(goal.target_date),
        today: todayInTimeZone(user.timeZone),
        payFrequency: user.payFrequency,
      })
    : 0;

  const estimate = estimateFreeMoney({
    monthlyIncome: user.monthlyIncome ?? 0,
    payFrequency: user.payFrequency,
    payDays: user.payDays,
    fixedExpenses,
    debts: debts.map((debt) => ({
      installmentAmount: debt.installment_amount,
      paymentDay: debt.payment_day,
    })),
    card: card
      ? {
          paymentDay: card.payment_day,
          plans: card.plans.map((plan) => ({
            principal: plan.principal,
            installmentsCount: plan.installments_count,
          })),
        }
      : null,
    goalPerPayment,
  });

  return { estimate, balances, fixedExpenses, card, debts, goal, goalPerPayment };
}

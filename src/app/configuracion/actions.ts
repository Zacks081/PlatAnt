"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { CurrentUser } from "@/lib/auth/session";
import { lastDayOfMonthIso, monthsBetween, todayInTimeZone } from "@/lib/dates";
import { firstFieldErrors, readForm, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { getCard, getGoal, getOpeningBalances, openStep } from "@/lib/onboarding/data";
import { resolveCardRate } from "@/lib/onboarding/estimate";
import { LAST_STEP, pathAfterStep, stepPath, STEPS, type StepNumber } from "@/lib/onboarding/steps";
import {
  balancesSchema,
  cardSchema,
  debtSchema,
  fixedExpenseSchema,
  goalSchema,
  incomeSchema,
  planSchema,
} from "@/lib/onboarding/validation";

/**
 * Acciones de la configuración inicial. Cada una comprueba la sesión, valida lo que llega
 * y escribe con los permisos del propio usuario: la base de datos no le deja tocar
 * nada que no sea suyo.
 */

type Db = Awaited<ReturnType<typeof openStep>>["db"];

const SAVE_ERROR: FormState = { message: "No pudimos guardar. Intenta de nuevo en un momento." };
const NEW_PLAN_PATH = `${stepPath(4)}/cuotas/nueva`;
const idSchema = z.uuid();

/** Deja anotado que el paso quedó hecho, sin devolver nunca el avance. */
async function markStepDone(db: Db, user: CurrentUser, step: StepNumber) {
  if (user.onboardingCompleted || user.onboardingStep >= step) return;
  const { error } = await db.from("profiles").update({ onboarding_step: step }).eq("id", user.id);
  if (error) throw new Error(`No se pudo guardar el avance: ${error.message}`);
}

// --- Paso 1: ingresos -------------------------------------------------------

export async function saveIncome(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user, db } = await openStep(1);
  const values = readForm(formData, ["monthlyIncome", "payFrequency", "payDay1", "payDay2"]);

  const parsed = incomeSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  const { error } = await db
    .from("profiles")
    .update({
      monthly_income: parsed.data.monthlyIncome,
      pay_frequency: parsed.data.payFrequency,
      pay_days: parsed.data.payDays,
      onboarding_step: Math.max(user.onboardingStep, 1),
    })
    .eq("id", user.id);
  if (error) return { ...SAVE_ERROR, values };

  redirect(pathAfterStep(1, user));
}

// --- Paso 2: saldos de hoy --------------------------------------------------

export async function saveBalances(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user, db } = await openStep(2);
  const values = readForm(formData, ["account", "cash"]);

  const parsed = balancesSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  for (const kind of ["account", "cash"] as const) {
    const { error } = await db.rpc("set_opening_balance", {
      p_kind: kind,
      p_amount: parsed.data[kind],
    });
    if (error) return { ...SAVE_ERROR, values };
  }

  await markStepDone(db, user, 2);
  redirect(pathAfterStep(2, user));
}

// --- Paso 3: gastos fijos ---------------------------------------------------

export async function saveFixedExpense(
  id: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { db } = await openStep(3);
  const values = readForm(formData, ["amount", "name", "categoryId", "dueDay", "split"]);

  const parsed = fixedExpenseSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  const row = {
    name: parsed.data.name,
    amount: parsed.data.amount,
    due_day: parsed.data.dueDay,
    category_id: parsed.data.categoryId,
    split: parsed.data.split,
  };
  const { error } = id
    ? await db.from("fixed_expenses").update(row).eq("id", idSchema.parse(id))
    : await db.from("fixed_expenses").insert(row);
  if (error) return { ...SAVE_ERROR, values };

  redirect(stepPath(3));
}

export async function deleteFixedExpense(id: string): Promise<void> {
  const { db } = await openStep(3);
  await db.from("fixed_expenses").delete().eq("id", idSchema.parse(id));
  redirect(stepPath(3));
}

// --- Paso 4: tarjeta de crédito ---------------------------------------------

export async function saveCard(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user, db } = await openStep(4);
  const values = readForm(formData, ["statementDay", "paymentDay", "monthlyRate", "debt"]);

  const parsed = cardSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  const card = await getCard(db);
  const inPlans = (card?.plans ?? []).reduce((total, plan) => total + plan.principal, 0);
  if (parsed.data.debt < inPlans) {
    return {
      errors: {
        debt: `Tus cuotas en curso suman ${formatMoney(inPlans)}. Lo que debes no puede ser menos.`,
      },
      values,
    };
  }

  const rate = resolveCardRate(parsed.data.monthlyRate);
  const { error } = await db.rpc("save_credit_card", {
    p_statement_day: parsed.data.statementDay,
    p_payment_day: parsed.data.paymentDay,
    p_monthly_rate: rate.monthlyRate,
    p_rate_is_estimated: rate.isEstimated,
    p_debt: parsed.data.debt,
  });
  if (error) return { ...SAVE_ERROR, values };

  // «Agregar cuota en curso» guarda la tarjeta y abre el formulario de la cuota.
  if (formData.get("intent") === "add-plan") redirect(NEW_PLAN_PATH);

  await markStepDone(db, user, 4);
  redirect(pathAfterStep(4, user));
}

export async function savePlan(
  id: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { db } = await openStep(4);
  const values = readForm(formData, ["principal", "name", "kind", "installmentsCount"]);

  const parsed = planSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  const card = await getCard(db);
  if (!card) redirect(stepPath(4));

  const { credit_card: debt } = await getOpeningBalances(db);
  const others = card.plans
    .filter((plan) => plan.id !== id)
    .reduce((total, plan) => total + plan.principal, 0);
  if (others + parsed.data.principal > debt) {
    return {
      errors: {
        principal: `Con esta, tus cuotas sumarían más de los ${formatMoney(debt)} que debes en la tarjeta.`,
      },
      values,
    };
  }

  const row = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    principal: parsed.data.principal,
    installments_count: parsed.data.installmentsCount,
  };
  const { error } = id
    ? await db.from("installment_plans").update(row).eq("id", idSchema.parse(id))
    : await db
        .from("installment_plans")
        .insert({ ...row, credit_card_id: card.id, is_initial: true });
  if (error) return { ...SAVE_ERROR, values };

  redirect(stepPath(4));
}

export async function deletePlan(id: string): Promise<void> {
  const { db } = await openStep(4);
  await db.from("installment_plans").delete().eq("id", idSchema.parse(id));
  redirect(stepPath(4));
}

// --- Paso 5: deudas ---------------------------------------------------------

export async function saveDebt(
  id: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { db } = await openStep(5);
  const values = readForm(formData, [
    "originalAmount",
    "name",
    "installmentAmount",
    "paymentDay",
    "installmentsRemaining",
  ]);

  const parsed = debtSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  const row = {
    name: parsed.data.name,
    original_amount: parsed.data.originalAmount,
    installment_amount: parsed.data.installmentAmount,
    payment_day: parsed.data.paymentDay,
    installments_remaining: parsed.data.installmentsRemaining,
  };
  const { error } = id
    ? await db.from("debts").update(row).eq("id", idSchema.parse(id))
    : await db.from("debts").insert(row);
  if (error) return { ...SAVE_ERROR, values };

  redirect(stepPath(5));
}

export async function deleteDebt(id: string): Promise<void> {
  const { db } = await openStep(5);
  await db.from("debts").delete().eq("id", idSchema.parse(id));
  redirect(stepPath(5));
}

// --- Paso 6: meta -----------------------------------------------------------

export async function saveGoal(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user, db } = await openStep(6);
  const values = readForm(formData, ["targetAmount", "name", "targetMonth"]);

  const parsed = goalSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  if (monthsBetween(todayInTimeZone(user.timeZone), parsed.data.targetMonth) < 0) {
    return { errors: { targetMonth: "Elige una fecha que no haya pasado." }, values };
  }

  const row = {
    name: parsed.data.name,
    target_amount: parsed.data.targetAmount,
    target_date: lastDayOfMonthIso(parsed.data.targetMonth),
  };
  const existing = await getGoal(db);
  const { error } = existing
    ? await db.from("goals").update(row).eq("id", existing.id)
    : await db.from("goals").insert(row);
  if (error) return { ...SAVE_ERROR, values };

  await markStepDone(db, user, 6);
  redirect(pathAfterStep(6, user));
}

export async function deleteGoal(): Promise<void> {
  const { user, db } = await openStep(6);
  const existing = await getGoal(db);
  if (existing) await db.from("goals").delete().eq("id", existing.id);
  redirect(pathAfterStep(6, user));
}

// --- Avanzar, saltar y terminar ---------------------------------------------

/** «Continuar» de los pasos que son una lista, y «Saltar» de los opcionales. */
export async function completeStep(step: StepNumber): Promise<void> {
  const definition = STEPS.find((candidate) => candidate.number === step);
  // Los pasos obligatorios solo se completan guardando su formulario.
  if (!definition?.optional) redirect(stepPath(1));

  const { user, db } = await openStep(step);
  await markStepDone(db, user, step);
  redirect(pathAfterStep(step, user));
}

/** «Empezar»: da por terminado el recorrido y abre la app. */
export async function finishOnboarding(): Promise<void> {
  const { user, db } = await openStep(LAST_STEP);
  // Sin pasar por todos los pasos (hechos o saltados) no se puede terminar.
  if (user.onboardingStep < LAST_STEP) redirect(stepPath(LAST_STEP));

  if (!user.onboardingCompleted) {
    const { error } = await db
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);
    if (error) throw new Error(`No se pudo terminar la configuración: ${error.message}`);
  }
  redirect("/");
}

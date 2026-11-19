"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { compareDates, formatIsoDate, todayInTimeZone } from "@/lib/dates";
import { setFlash } from "@/lib/flash";
import { firstFieldErrors, readForm, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { openApp } from "@/lib/movements/data";
import { pocketMoneySchema } from "@/lib/movements/validation";
import { fixedPocketPath, pocketDue } from "@/lib/pockets/fixed";
import { getFixedPocket } from "@/lib/pockets/fixed-data";

/**
 * Acciones del bolsillo de un gasto fijo: apartar (de la cuenta al bolsillo), sacar (del
 * bolsillo a la cuenta) y pagar el gasto desde el bolsillo.
 */

const SAVE_ERROR = "No pudimos guardar. Intenta de nuevo en un momento.";
const idSchema = z.uuid();

/** Lo que devuelve «Pagar»: además de errores, puede avisar que el bolsillo no alcanza. */
export type PocketFormState = FormState & {
  shortfall?: { message: string; label: string };
};

function finish(path: string): never {
  revalidatePath("/", "layout");
  redirect(path);
}

/** Apartar (`into` = true) o sacar plata del bolsillo. */
export async function movePocketMoney(
  fixedExpenseId: string,
  into: boolean,
  _previous: PocketFormState,
  formData: FormData,
): Promise<PocketFormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["amount", "date"]);
  const parsed = pocketMoneySchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const { amount, date } = parsed.data;
  if (compareDates(date, todayInTimeZone(user.timeZone)) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  const id = idSchema.parse(fixedExpenseId);
  const { error } = await db.rpc("move_fixed_pocket", {
    p_fixed_expense: id,
    p_amount: amount,
    p_occurred_on: formatIsoDate(date),
    p_into_pocket: into,
  });
  if (error?.code === "PA402") {
    return { errors: { amount: "El bolsillo no tiene tanto." }, values };
  }
  if (error) return { message: SAVE_ERROR, values };

  const money = formatMoney(amount, { currency: user.currency });
  await setFlash(into ? `Apartaste ${money}` : `Sacaste ${money} a la cuenta`);
  finish(fixedPocketPath(id));
}

/**
 * Pagar el gasto desde su bolsillo. Si no alcanza, pregunta si lo que falta sale de la
 * cuenta; con la respuesta («cover»), paga.
 */
export async function payFromPocket(
  fixedExpenseId: string,
  _previous: PocketFormState,
  formData: FormData,
): Promise<PocketFormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["amount", "date", "cover"]);
  const parsed = pocketMoneySchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const { amount, date } = parsed.data;
  if (compareDates(date, todayInTimeZone(user.timeZone)) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  const id = idSchema.parse(fixedExpenseId);
  const money = (value: number) => formatMoney(value, { currency: user.currency });

  // Un pago por mes: si ya se pagó este mes, no se paga otra vez.
  const pocket = await getFixedPocket(db, id);
  const lastPayment = pocket?.movements.find((movement) => movement.kind === "expense");
  if (
    pocket &&
    pocketDue(todayInTimeZone(user.timeZone), pocket.fixed.due_day, {
      unpaidDueOn: pocket.nextDueOn,
      lastPaymentOn: lastPayment?.occurred_on ?? null,
    }).paidThisMonth
  ) {
    return { message: `Ya pagaste ${pocket.fixed.name} este mes.`, values };
  }

  const { error } = await db.rpc("pay_fixed_expense", {
    p_fixed_expense: id,
    p_amount: amount,
    p_occurred_on: formatIsoDate(date),
    p_cover_from_account: values.cover === "yes",
  });
  if (error?.code === "PA402") {
    const missing = Number(error.details);
    return {
      values: { ...values, cover: "" },
      shortfall: {
        message: `El bolsillo tiene ${money(Math.max(0, amount - missing))} y el pago es de ${money(amount)}. ¿Sacas los ${money(missing)} que faltan de la cuenta?`,
        label: "Sí, sacar de la cuenta",
      },
    };
  }
  if (error) return { message: SAVE_ERROR, values };

  const { data: fixed } = await db.from("fixed_expenses").select("name").eq("id", id).maybeSingle();
  await setFlash(`${fixed?.name ?? "Gasto"} pagado: ${money(amount)}`);
  finish(fixedPocketPath(id));
}

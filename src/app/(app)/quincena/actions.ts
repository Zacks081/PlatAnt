"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { compareDates, formatIsoDate, parseIsoDate, todayInTimeZone } from "@/lib/dates";
import { setFlash } from "@/lib/flash";
import { firstFieldErrors, readForm, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { onDayLabel } from "@/lib/movements/format";
import { openApp } from "@/lib/movements/data";
import { paySchema, safeReturnPath } from "@/lib/movements/validation";
import { getCurrentPeriod } from "@/lib/pay-periods/data";
import {
  expectedEnd,
  instanceFromRow,
  instanceKey,
  matchPay,
  payMonthIso,
  payOptions,
} from "@/lib/pay-periods/schedule";
import { nextPayStatus, payName, PERIOD_WORDS, QUINCENA_PATH } from "@/lib/pay-periods/summary";

/**
 * Acciones de la quincena: «Me pagaron» y corregir o borrar ese pago.
 * Las fechas de pago las calcula la app; la base de datos abre la quincena, aparta, pasa la
 * plata a los bolsillos y registra los movimientos, todo de una vez.
 */

const SAVE_ERROR = "No pudimos guardar. Intenta de nuevo en un momento.";
const idSchema = z.uuid();

/**
 * Lo que devuelve «Me pagaron»: además de errores, puede pedir confirmar un pago repetido o, en
 * el primer pago, preguntar si lo que les tocaba a pagos anteriores ya estaba apartado.
 */
export type PayFormState = FormState & {
  confirm?: { message: string; key: string; label: string };
  prior?: { message: string };
};

function finish(path: string): never {
  revalidatePath("/", "layout");
  redirect(path);
}

/** Registrar un pago: sube la cuenta o el efectivo, abre la quincena nueva y aparta lo que le toca. */
export async function registerPay(
  _previous: PayFormState,
  formData: FormData,
): Promise<PayFormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["amount", "date", "pocket", "instance", "confirm", "prior"]);

  const parsed = paySchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const { amount, date, pocket } = parsed.data;
  const today = todayInTimeZone(user.timeZone);
  if (compareDates(date, today) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  const last = await getCurrentPeriod(db);
  // El siguiente pago se registra solo cuando ya está cerca (lo mismo que muestra la pantalla).
  const status = last ? nextPayStatus(today, parseIsoDate(last.expected_end_on)!) : null;
  if (last && status && !status.open) {
    return {
      message: `Todavía no: te pagan ${onDayLabel(last.expected_end_on, today)}. Podrás registrarlo desde ${onDayLabel(formatIsoDate(status.opensOn), today)}.`,
      values,
    };
  }
  if (last && compareDates(date, parseIsoDate(last.started_on)!) < 0) {
    return {
      errors: {
        date: `Tu último pago llegó ${onDayLabel(last.started_on, today)}: esta fecha va antes.`,
      },
      values,
    };
  }

  // La quincena la propone la app (la que sigue a la última, o la que se esperaba) y el
  // usuario la puede cambiar entre las que tienen sentido para esa fecha.
  const lastInstance = last ? instanceFromRow(last) : null;
  const { suggested, options } = payOptions(date, lastInstance, user.payDays);
  const instance = values.instance
    ? options.find((option) => String(instanceKey(option)) === values.instance)
    : suggested;
  if (!instance) {
    return { errors: { instance: "Elige de qué quincena es este pago." }, values };
  }

  // Si la fecha queda más cerca del pago que ya se registró, puede ser un registro repetido:
  // antes de abrir otra quincena, se pregunta.
  const key = String(instanceKey(instance));
  const { duplicateOf } = matchPay(date, lastInstance, user.payDays);
  if (duplicateOf && last && values.confirm !== key) {
    const proposed = payName(instance, user.payDays);
    return {
      values: { ...values, confirm: "" },
      confirm: {
        key,
        message: `Ya registraste ${payName(duplicateOf, user.payDays)}, que llegó ${onDayLabel(last.started_on, today)}. ¿Este pago es ${proposed}?`,
        label: `Sí, es ${proposed}`,
      },
    };
  }

  const { data: periodId, error } = await db.rpc("open_pay_period", {
    p_amount: amount,
    p_received_on: formatIsoDate(date),
    p_pay_month: payMonthIso(instance),
    p_pay_slot: instance.slot,
    p_expected_end_on: formatIsoDate(expectedEnd(instance, date, user.payDays)),
    p_pocket_kind: pocket,
    // En el primer pago, si no se ha respondido, la base de datos avisa (PA428) cuánto les
    // tocaba a pagos anteriores y aquí se pregunta.
    p_prior_covered: values.prior === "yes",
    p_ask_prior: values.prior !== "yes" && values.prior !== "no",
  });
  const money = (value: number) => formatMoney(value, { currency: user.currency });
  if (error?.code === "PA428") {
    const earlier = user.payFrequency === "monthly" ? "pagos" : "quincenas";
    return {
      values: { ...values, prior: "" },
      prior: {
        message: `De tus gastos fijos que vencen antes del próximo pago, ${money(Number(error.details))} les tocaban a ${earlier} de antes de usar la app. ¿Ya tienes esa plata apartada?`,
      },
    };
  }
  if (error?.code === "PA409") return { message: "Ese pago ya está registrado.", values };
  if (error || !periodId) return { message: SAVE_ERROR, values };

  // Lo que la quincena pasó sola de la cuenta a los bolsillos.
  const { data: rows } = await db
    .from("movements")
    .select("amount")
    .eq("pay_period_id", periodId)
    .eq("origin", "set_aside");
  const count = rows?.length ?? 0;
  const total = (rows ?? []).reduce((sum, row) => sum + row.amount, 0);
  await setFlash(
    count > 0
      ? `${PERIOD_WORDS[user.payFrequency].opened}: pasamos ${money(total)} a ${count} ${count === 1 ? "bolsillo" : "bolsillos"}`
      : `Pago de ${money(amount)} guardado`,
  );
  finish(QUINCENA_PATH);
}

/** Corregir el valor, la fecha o el bolsillo del último pago. */
export async function updatePay(
  periodId: string,
  back: string,
  _previous: PayFormState,
  formData: FormData,
): Promise<PayFormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["amount", "date", "pocket"]);

  const parsed = paySchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  if (compareDates(parsed.data.date, todayInTimeZone(user.timeZone)) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  const { error } = await db.rpc("update_pay_period", {
    p_id: idSchema.parse(periodId),
    p_amount: parsed.data.amount,
    p_received_on: formatIsoDate(parsed.data.date),
    p_pocket_kind: parsed.data.pocket,
  });
  if (error?.code === "PA409") return { message: "Solo puedes corregir tu último pago.", values };
  if (error?.code === "23514") {
    return {
      errors: { date: "Esa fecha no sirve: va antes de tu pago anterior o del siguiente." },
      values,
    };
  }
  if (error) return { message: SAVE_ERROR, values };

  await setFlash(
    `Pago de ${formatMoney(parsed.data.amount, { currency: user.currency })} actualizado`,
  );
  finish(safeReturnPath(back));
}

/** Borrar el último pago: se van el ingreso, la quincena y sus apartados. */
export async function deletePay(periodId: string, back: string): Promise<void> {
  const { db } = await openApp();
  const { error } = await db.rpc("delete_pay_period", { p_id: idSchema.parse(periodId) });
  if (error?.code === "PA423") {
    await setFlash("No se puede borrar: ya marcaste pagos con esta plata. Bórralos primero.");
    finish(safeReturnPath(back));
  }
  await setFlash(error ? "No pudimos borrar el pago." : "Pago borrado");
  finish(error ? safeReturnPath(back) : QUINCENA_PATH);
}

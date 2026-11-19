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
  nominalPayDate,
  payMonthIso,
} from "@/lib/pay-periods/schedule";
import { dayMonthLabel, PERIOD_WORDS, QUINCENA_PATH } from "@/lib/pay-periods/summary";

/**
 * Acciones de la quincena: «Me pagaron», corregir o borrar ese pago y «Ya pagué».
 * Las fechas de pago las calcula la app; la base de datos abre la quincena, aparta y
 * registra los movimientos, todo de una vez.
 */

const SAVE_ERROR = "No pudimos guardar. Intenta de nuevo en un momento.";
const idSchema = z.uuid();

/** Lo que devuelve «Me pagaron»: además de errores, puede pedir confirmar un pago repetido. */
export type PayFormState = FormState & {
  confirm?: { message: string; key: string; label: string };
};

function finish(path: string): never {
  revalidatePath("/", "layout");
  redirect(path);
}

/** Registrar un pago: sube la cuenta, abre la quincena nueva y aparta lo que le toca. */
export async function registerPay(
  _previous: PayFormState,
  formData: FormData,
): Promise<PayFormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["amount", "date", "confirm"]);

  const parsed = paySchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const { amount, date } = parsed.data;
  const today = todayInTimeZone(user.timeZone);
  if (compareDates(date, today) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  const last = await getCurrentPeriod(db);
  if (last && compareDates(date, parseIsoDate(last.started_on)!) < 0) {
    return {
      errors: {
        date: `Tu último pago llegó ${onDayLabel(last.started_on, today)}: esta fecha va antes.`,
      },
      values,
    };
  }

  // Si la fecha queda más cerca del pago que ya se registró, puede ser un registro repetido:
  // antes de abrir otra quincena, se pregunta.
  const match = matchPay(date, last ? instanceFromRow(last) : null, user.payDays);
  const key = String(instanceKey(match.instance));
  if (match.duplicateOf && last && values.confirm !== key) {
    const proposed = dayMonthLabel(nominalPayDate(match.instance, user.payDays));
    return {
      values: { amount: values.amount, date: values.date },
      confirm: {
        key,
        message: `Ya registraste el pago del ${dayMonthLabel(nominalPayDate(match.duplicateOf, user.payDays))}, que llegó ${onDayLabel(last.started_on, today)}. ¿Este es el pago del ${proposed}, que llegó antes?`,
        label: `Sí, es el pago del ${proposed}`,
      },
    };
  }

  const { data: periodId, error } = await db.rpc("open_pay_period", {
    p_amount: amount,
    p_received_on: formatIsoDate(date),
    p_pay_month: payMonthIso(match.instance),
    p_pay_slot: match.instance.slot,
    p_expected_end_on: formatIsoDate(expectedEnd(match.instance, date, user.payDays)),
  });
  if (error?.code === "PA409") return { message: "Ese pago ya está registrado.", values };
  if (error || !periodId) return { message: SAVE_ERROR, values };

  const { data: rows } = await db.from("set_asides").select("amount").eq("pay_period_id", periodId);
  const count = rows?.length ?? 0;
  const total = (rows ?? []).reduce((sum, row) => sum + row.amount, 0);
  const money = (value: number) => formatMoney(value, { currency: user.currency });
  await setFlash(
    count > 0
      ? `${PERIOD_WORDS[user.payFrequency].opened}: apartamos ${money(total)} para ${count} ${count === 1 ? "pago" : "pagos"}`
      : `Pago de ${money(amount)} guardado`,
  );
  finish(QUINCENA_PATH);
}

/** Corregir el valor o la fecha del último pago. */
export async function updatePay(
  periodId: string,
  back: string,
  _previous: PayFormState,
  formData: FormData,
): Promise<PayFormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["amount", "date"]);

  const parsed = paySchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  if (compareDates(parsed.data.date, todayInTimeZone(user.timeZone)) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  const { error } = await db.rpc("update_pay_period", {
    p_id: idSchema.parse(periodId),
    p_amount: parsed.data.amount,
    p_received_on: formatIsoDate(parsed.data.date),
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

/** «Ya pagué»: registra el gasto desde la cuenta y marca el apartado como pagado. */
export async function paySetAside(id: string): Promise<void> {
  const { user, db } = await openApp();
  const setAsideId = idSchema.parse(id);
  const { data: row } = await db
    .from("set_asides")
    .select("fixed_expenses(name, amount)")
    .eq("id", setAsideId)
    .maybeSingle();

  const { error } = await db.rpc("pay_set_aside", { p_id: setAsideId });
  const fixed = row?.fixed_expenses;
  await setFlash(
    error?.code === "PA409"
      ? "Ese pago ya estaba marcado"
      : error || !fixed
        ? "No pudimos marcar el pago. Intenta de nuevo."
        : `${fixed.name} pagado: ${formatMoney(fixed.amount, { currency: user.currency })}`,
  );
  // Vuelve a la misma pantalla: el parámetro hace que el aviso se muestre.
  finish(`${QUINCENA_PATH}?pagado=${setAsideId}`);
}

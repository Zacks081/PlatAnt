import { z } from "zod";

import { parseIsoDate } from "@/lib/dates";
import { MAX_AMOUNT, parseMoneyInput } from "@/lib/money-input";

/**
 * Reglas de los formularios de la configuración inicial. Se aplican en el servidor.
 * Todos los campos llegan como texto, tal como los escribió la persona.
 */

const NAME_MAX = 60;

/** Monto escrito con o sin puntos de miles. Vacío o cero no valen. */
const money = (emptyMessage: string) =>
  z
    .string()
    .transform((text) => parseMoneyInput(text))
    .pipe(
      z
        .number({ error: emptyMessage })
        .int()
        .min(1, emptyMessage)
        .max(MAX_AMOUNT, "Ese valor es demasiado grande."),
    );

/** Igual que `money`, pero acepta vacío y cero (por ejemplo, no tener efectivo). */
const moneyOrZero = z
  .string()
  .transform((text) => parseMoneyInput(text) ?? 0)
  .pipe(z.number().int().min(0).max(MAX_AMOUNT, "Ese valor es demasiado grande."));

const dayOfMonth = (message: string) =>
  z
    .string()
    .regex(/^\d{1,2}$/, message)
    .transform(Number)
    .pipe(z.number().int().min(1, message).max(31, message));

const name = (emptyMessage: string) =>
  z
    .string()
    .trim()
    .min(1, emptyMessage)
    .max(NAME_MAX, `Puede tener máximo ${NAME_MAX} caracteres.`);

const count = (message: string, max: number) =>
  z
    .string()
    .regex(/^\d{1,3}$/, message)
    .transform(Number)
    .pipe(z.number().int().min(1, message).max(max, message));

export const incomeSchema = z
  .object({
    monthlyIncome: money("Escribe cuánto te entra al mes."),
    payFrequency: z.enum(["biweekly", "monthly"], { error: "Elige cómo te pagan." }),
    payDay1: dayOfMonth("Elige el día de pago."),
    // Solo cuenta si el pago es quincenal.
    payDay2: z.string(),
  })
  .transform((data, context) => {
    if (data.payFrequency === "monthly") {
      return {
        monthlyIncome: data.monthlyIncome,
        payFrequency: data.payFrequency,
        payDays: [data.payDay1],
      };
    }
    const second = dayOfMonth("Elige el segundo día de pago.").safeParse(data.payDay2);
    if (!second.success) {
      context.addIssue({
        code: "custom",
        path: ["payDay2"],
        message: "Elige el segundo día de pago.",
      });
      return z.NEVER;
    }
    if (second.data <= data.payDay1) {
      context.addIssue({
        code: "custom",
        path: ["payDay2"],
        message: "El segundo pago debe ser después del primero.",
      });
      return z.NEVER;
    }
    return {
      monthlyIncome: data.monthlyIncome,
      payFrequency: data.payFrequency,
      payDays: [data.payDay1, second.data],
    };
  });

export const balancesSchema = z.object({ account: moneyOrZero, cash: moneyOrZero });

/** Fecha elegida en el selector, como «2027-12-15». */
const isoDate = (message: string) =>
  z
    .string()
    .transform((text) => parseIsoDate(text))
    .pipe(z.object({ year: z.number(), month: z.number(), day: z.number() }, { error: message }));

export const fixedExpenseSchema = z.object({
  amount: money("Escribe cuánto pagas."),
  name: name("Ponle un nombre al gasto."),
  categoryId: z.uuid("Elige una categoría."),
  /** Solo cuenta si la categoría elegida es «Otros»: crea una categoría con ese nombre. */
  newCategory: z.string().trim().max(40, "Puede tener máximo 40 caracteres."),
  dueDay: dayOfMonth("Elige el día de pago."),
  split: z.enum(["first", "second", "half"], { error: "Elige de qué quincena sale." }),
});

/** Tasa mensual en porcentaje. Acepta coma o punto; vacío significa «no la sé». */
const optionalRate = z
  .string()
  .trim()
  .transform((text, context) => {
    if (text === "") return null;
    const normalized = text.replace("%", "").trim().replace(",", ".");
    const value = Number(normalized);
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(normalized) || value > 15) {
      context.addIssue({ code: "custom", message: "Escribe un porcentaje entre 0 y 15." });
      return z.NEVER;
    }
    return value;
  });

export const cardSchema = z.object({
  statementDay: dayOfMonth("Elige el día de corte."),
  paymentDay: dayOfMonth("Elige el día de pago."),
  monthlyRate: optionalRate,
});

/**
 * Algo que se debe o se paga con la tarjeta: una compra o un avance a cuotas, o un plan
 * mensual (un cobro que se repite cada mes, sin fecha de fin).
 */
export const planSchema = z
  .object({
    principal: money("Escribe el valor."),
    name: name("Ponle un nombre."),
    kind: z.enum(["purchase", "advance", "subscription"], { error: "Elige qué fue." }),
    // Un plan mensual no tiene cuotas.
    installmentsCount: z.string(),
  })
  .transform((data, context) => {
    if (data.kind === "subscription") return { ...data, installmentsCount: 1 };
    const parsed = count("Escribe cuántas cuotas faltan (1 a 120).", 120).safeParse(
      data.installmentsCount,
    );
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        path: ["installmentsCount"],
        message: "Escribe cuántas cuotas faltan (1 a 120).",
      });
      return z.NEVER;
    }
    return { ...data, installmentsCount: parsed.data };
  });

/** Una deuda: se paga de una vez en una fecha, o por cuotas cada mes. */
export const debtSchema = z
  .object({
    originalAmount: money("Escribe cuánto debes."),
    name: name("Ponle un nombre a la deuda."),
    paymentType: z.enum(["single", "monthly"], { error: "Elige cómo la pagas." }),
    dueDate: z.string(),
    installmentAmount: z.string(),
    paymentDay: z.string(),
    installmentsRemaining: z.string(),
  })
  .transform((data, context) => {
    const fail = (field: string, message: string) => {
      context.addIssue({ code: "custom", path: [field], message });
      return z.NEVER;
    };
    const base = { originalAmount: data.originalAmount, name: data.name };

    if (data.paymentType === "single") {
      const dueDate = parseIsoDate(data.dueDate);
      if (!dueDate) return fail("dueDate", "Elige la fecha en que la pagas.");
      // Un pago único es una sola cuota por el total, el día de su fecha.
      return {
        ...base,
        paymentType: "single" as const,
        dueDate,
        installmentAmount: data.originalAmount,
        paymentDay: dueDate.day,
        installmentsRemaining: 1,
      };
    }

    const installmentAmount = money("Escribe el valor de la cuota.").safeParse(
      data.installmentAmount,
    );
    if (!installmentAmount.success) {
      return fail("installmentAmount", "Escribe el valor de la cuota.");
    }
    if (installmentAmount.data > data.originalAmount) {
      return fail("installmentAmount", "La cuota no puede ser mayor que lo que debes.");
    }
    const installmentsRemaining = count("", 600).safeParse(data.installmentsRemaining);
    if (!installmentsRemaining.success) {
      return fail("installmentsRemaining", "Escribe cuántas cuotas faltan (1 a 600).");
    }
    const paymentDay = dayOfMonth("").safeParse(data.paymentDay);
    if (!paymentDay.success) return fail("paymentDay", "Elige el día de pago.");

    return {
      ...base,
      paymentType: "monthly" as const,
      dueDate: null,
      installmentAmount: installmentAmount.data,
      paymentDay: paymentDay.data,
      installmentsRemaining: installmentsRemaining.data,
    };
  });

export const goalSchema = z.object({
  targetAmount: money("Escribe cuánto quieres juntar."),
  name: name("Ponle un nombre a la meta."),
  targetDate: isoDate("Elige para cuándo la quieres."),
});

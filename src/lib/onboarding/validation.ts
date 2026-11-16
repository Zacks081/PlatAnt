import { z } from "zod";

import { parseYearMonth } from "@/lib/dates";
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

export const fixedExpenseSchema = z.object({
  amount: money("Escribe cuánto pagas."),
  name: name("Ponle un nombre al gasto."),
  categoryId: z.uuid("Elige una categoría."),
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
  debt: moneyOrZero,
});

export const planSchema = z.object({
  principal: money("Escribe cuánto falta por pagar."),
  name: name("Ponle un nombre."),
  kind: z.enum(["purchase", "advance"], { error: "Elige si es compra o avance." }),
  installmentsCount: count("Escribe cuántas cuotas faltan (1 a 120).", 120),
});

export const debtSchema = z
  .object({
    originalAmount: money("Escribe cuánto debes."),
    name: name("Ponle un nombre a la deuda."),
    installmentAmount: money("Escribe el valor de la cuota."),
    paymentDay: dayOfMonth("Elige el día de pago."),
    installmentsRemaining: count("Escribe cuántas cuotas faltan (1 a 600).", 600),
  })
  .refine((debt) => debt.installmentAmount <= debt.originalAmount, {
    path: ["installmentAmount"],
    message: "La cuota no puede ser mayor que lo que debes.",
  });

export const goalSchema = z.object({
  targetAmount: money("Escribe cuánto quieres juntar."),
  name: name("Ponle un nombre a la meta."),
  targetMonth: z
    .string()
    .transform((text) => parseYearMonth(text))
    .pipe(
      z.object({ year: z.number(), month: z.number() }, { error: "Elige para cuándo la quieres." }),
    ),
});

import { z } from "zod";

import { parseIsoDate } from "@/lib/dates";
import { MAX_AMOUNT, parseMoneyInput } from "@/lib/money-input";

/** Reglas de los formularios de movimientos y categorías. Se aplican en el servidor. */

export const movementSchema = z.object({
  amount: z
    .string()
    .transform((text) => parseMoneyInput(text))
    .pipe(
      z
        .number({ error: "Escribe el valor." })
        .int()
        .min(1, "Escribe el valor.")
        .max(MAX_AMOUNT, "Ese valor es demasiado grande."),
    ),
  categoryId: z.uuid("Elige una categoría."),
  /** Solo cuenta si la categoría elegida es «Otros»: crea una categoría con ese nombre. */
  newCategory: z.string().trim().max(40, "Puede tener máximo 40 caracteres."),
  pocketId: z.uuid("Elige de dónde sale."),
  /** Solo cuenta si se paga con tarjeta: a cuántas cuotas. */
  installments: z.string(),
  date: z
    .string()
    .transform((text) => parseIsoDate(text))
    .pipe(
      z.object(
        { year: z.number(), month: z.number(), day: z.number() },
        { error: "Elige la fecha." },
      ),
    ),
  description: z.string().trim().max(140, "Puede tener máximo 140 caracteres."),
});

/** Monto opcional: vacío es 0. */
const optionalAmount = z
  .string()
  .transform((text) => parseMoneyInput(text) ?? 0)
  .pipe(z.number().int().min(0).max(MAX_AMOUNT, "Ese valor es demasiado grande."));

/** Retiro o consignación: el valor, la fecha, una nota opcional y, en un retiro, su costo. */
export const transferSchema = movementSchema
  .pick({ amount: true, date: true, description: true })
  .extend({ fee: optionalAmount });

/** Apartar, sacar o pagar desde el bolsillo de un gasto fijo: el valor y la fecha. */
export const pocketMoneySchema = movementSchema.pick({ amount: true, date: true });

/** «Me pagaron»: cuánto llegó de verdad, cuándo y si entró a la cuenta o en efectivo. */
export const paySchema = movementSchema
  .pick({ amount: true, date: true })
  .extend({ pocket: z.enum(["account", "cash"], "Elige dónde te pagaron.") });

/** Cuadre: cuánto hay de verdad (puede ser 0) y el saldo que la app mostraba al cuadrar. */
export const reconcileSchema = z.object({
  actual: z
    .string()
    .transform((text) => parseMoneyInput(text))
    .pipe(
      z
        .number({ error: "Escribe cuánto tienes." })
        .int()
        .max(MAX_AMOUNT, "Ese valor es demasiado grande."),
    ),
  expected: z.coerce.number().int(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre.").max(40, "Puede tener máximo 40 caracteres."),
  icon: z.string().regex(/^[a-z-]{1,30}$/, "Elige un ícono."),
  isAnt: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/** Categorías «Otros»: al elegirlas se puede escribir una categoría nueva. */
export const OTHER_CATEGORIES = ["Otros", "Otros ingresos"];

/** Donde va el costo de un retiro. */
export const FEES_CATEGORY = "Comisiones y cargos";

/** Nombres que no se pueden cambiar ni ocultar: la app los usa por su nombre. */
export const PROTECTED_CATEGORIES = [...OTHER_CATEGORIES, FEES_CATEGORY];

/**
 * Ruta interna segura a la que volver después de guardar. Solo acepta rutas propias
 * («/algo»); cualquier otra cosa va al inicio.
 */
export function safeReturnPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  return path;
}

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

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre.").max(40, "Puede tener máximo 40 caracteres."),
  icon: z.string().regex(/^[a-z-]{1,30}$/, "Elige un ícono."),
  isAnt: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/** Nombres que no se pueden cambiar ni ocultar: la app los usa para crear categorías nuevas. */
export const PROTECTED_CATEGORIES = ["Otros", "Otros ingresos"];

/**
 * Ruta interna segura a la que volver después de guardar. Solo acepta rutas propias
 * («/algo»); cualquier otra cosa va al inicio.
 */
export function safeReturnPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  return path;
}

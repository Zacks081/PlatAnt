import type { z } from "zod";

/** Error de cada campo de un formulario, por nombre. */
export type FieldErrors = Partial<Record<string, string>>;

/** Lo que una acción de formulario le devuelve a la pantalla. */
export type FormState = {
  /** Mensaje general de error. */
  message?: string;
  /** Error de cada campo, por nombre. */
  errors?: FieldErrors;
  /** Lo que la persona había escrito, para no borrárselo. Nunca incluye contraseñas. */
  values?: Record<string, string>;
};

export const emptyFormState: FormState = {};

/** Primer error de cada campo, listo para mostrar junto al campo. */
export function firstFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Lee del formulario solo los campos pedidos, como texto. */
export function readForm<const K extends string>(formData: FormData, keys: readonly K[]) {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : ""];
    }),
  ) as Record<K, string>;
}

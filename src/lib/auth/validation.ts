import { z } from "zod";

/**
 * Reglas de los formularios de cuenta. Se usan en el servidor, que es donde cuentan:
 * la validación del navegador es solo ayuda para el usuario.
 *
 * Las contraseñas no se guardan aquí: Supabase las guarda cifradas (bcrypt).
 * Estas reglas solo deciden qué contraseña se acepta.
 */

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt solo usa los primeros 72 bytes; más largo daría una falsa sensación de seguridad.
const PASSWORD_MAX_LENGTH = 72;
export const NAME_MAX_LENGTH = 60;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Escribe tu correo.")
  .pipe(z.email("Ese correo no parece válido."));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña puede tener máximo ${PASSWORD_MAX_LENGTH} caracteres.`)
  .regex(/\p{L}/u, "La contraseña debe tener al menos una letra.")
  .regex(/\d/, "La contraseña debe tener al menos un número.");

const name = z
  .string()
  .trim()
  .min(1, "Escribe tu nombre de usuario.")
  .max(NAME_MAX_LENGTH, `El nombre de usuario puede tener máximo ${NAME_MAX_LENGTH} caracteres.`);

export const signInSchema = z.object({
  email,
  // Al entrar no se revisa qué tan fuerte es: eso se decidió al crearla.
  password: z.string().min(1, "Escribe tu contraseña."),
});

export const signUpSchema = z.object({ name, email, password: newPassword });

export type FieldErrors = Partial<Record<string, string>>;

/** Primer error de cada campo, listo para mostrar debajo del campo. */
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

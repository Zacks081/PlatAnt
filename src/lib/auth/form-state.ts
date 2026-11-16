import type { FieldErrors } from "./validation";

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

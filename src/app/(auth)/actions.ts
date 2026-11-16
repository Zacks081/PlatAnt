"use server";

import { redirect } from "next/navigation";

import type { FormState } from "@/lib/auth/form-state";
import { authMessages, signInErrorMessage, signUpErrorMessage } from "@/lib/auth/messages";
import {
  firstFieldErrors,
  newPasswordSchema,
  passwordResetRequestSchema,
  readForm,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/validation";
import { isRegistrationOpen } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Entrar con correo y contraseña. */
export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const form = readForm(formData, ["email", "password"]);
  const values = { email: form.email };

  const parsed = signInSchema.safeParse(form);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { message: signInErrorMessage(error), values };

  redirect("/");
}

/**
 * Crear una cuenta. Supabase tiene el registro directo apagado: la única puerta es esta
 * acción, que corre en el servidor y solo crea cuentas si el registro está abierto.
 */
export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const form = readForm(formData, ["name", "email", "password"]);
  const values = { name: form.name, email: form.email };

  if (!isRegistrationOpen()) return { message: authMessages.registrationClosed, values };

  const parsed = signUpSchema.safeParse(form);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const { name, email, password } = parsed.data;

  const { error: createError } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    // Por ahora no se pide confirmar el correo (decisión de Santiago).
    email_confirm: true,
    user_metadata: { name },
  });
  if (createError) return { message: signUpErrorMessage(createError), values };

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  // La cuenta ya existe; si la entrada automática falla, que entre desde el login.
  if (signInError) redirect("/entrar");

  redirect("/");
}

/** Pedir el correo para cambiar la contraseña. Responde igual exista o no la cuenta. */
export async function requestPasswordReset(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const form = readForm(formData, ["email"]);
  const parsed = passwordResetRequestSchema.safeParse(form);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values: form };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  return { ok: true, message: authMessages.resetLinkSent };
}

/** Guardar la contraseña nueva. Pide sesión: llega aquí quien abrió el enlace del correo. */
export async function updatePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(readForm(formData, ["password"]));
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/entrar");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { errors: { password: "Esa es tu contraseña actual. Elige una distinta." } };
    }
    if (error.code === "weak_password") return { errors: { password: authMessages.weakPassword } };
    return { message: authMessages.generic };
  }

  redirect("/");
}

/** Cerrar la sesión en este dispositivo. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar");
}

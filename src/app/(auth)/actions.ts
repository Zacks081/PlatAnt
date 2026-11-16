"use server";

import { redirect } from "next/navigation";

import type { FormState } from "@/lib/auth/form-state";
import { authMessages, signInErrorMessage, signUpErrorMessage } from "@/lib/auth/messages";
import { firstFieldErrors, readForm, signInSchema, signUpSchema } from "@/lib/auth/validation";
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

/** Cerrar la sesión en este dispositivo. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar");
}

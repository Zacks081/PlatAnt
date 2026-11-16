import { z } from "zod";

/**
 * Variables de entorno. Se leen al usarlas, no al cargar el archivo, para que la app
 * compile aunque falten y avise con un mensaje claro cuando de verdad se necesitan.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL debe ser la URL del proyecto."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."),
});

/** URL y clave pública de Supabase. Son seguras para el navegador. */
export function getSupabasePublicEnv() {
  const parsed = publicSchema.safeParse({
    // Next solo reemplaza las NEXT_PUBLIC_ cuando se escriben completas.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      `Faltan variables de Supabase en .env.local: ${parsed.error.issues.map((i) => i.message).join(" ")}`,
    );
  }
  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Clave secreta de Supabase. Salta la seguridad por fila: solo se usa en el servidor. */
export function getSupabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("Falta SUPABASE_SECRET_KEY en .env.local.");
  }
  return key;
}

/**
 * Si se pueden crear cuentas nuevas. Cerrado salvo que REGISTRATION_OPEN sea exactamente "true".
 * En producción, cambiarla exige volver a publicar la app.
 */
export function isRegistrationOpen(): boolean {
  return process.env.REGISTRATION_OPEN === "true";
}

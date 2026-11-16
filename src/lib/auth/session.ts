import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  name: string;
  currency: string;
  timeZone: string;
  payFrequency: Database["public"]["Enums"]["pay_frequency"];
  onboardingCompleted: boolean;
};

/**
 * El usuario que hace la petición, con su perfil. Si no hay sesión, manda al login.
 * Toda página interna y toda acción deben pasar por aquí antes de tocar datos:
 * el filtro de src/proxy.ts es solo la primera barrera.
 * `cache` evita repetir la consulta dentro de una misma petición.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  // La sesión se comprueba contra la hora actual, así que esto siempre corre en cada
  // petición y nunca se guarda en una página precalculada.
  await connection();

  const supabase = await createClient();
  // getClaims comprueba la firma de la sesión; no confía en la cookie tal cual.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/entrar");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("name, currency, time_zone, pay_frequency, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    // Sesión válida pero sin perfil: la cuenta se borró o la base de datos no responde.
    throw new Error("No se pudo cargar el perfil del usuario.");
  }

  return {
    id: userId,
    name: profile.name,
    currency: profile.currency,
    timeZone: profile.time_zone,
    payFrequency: profile.pay_frequency,
    onboardingCompleted: profile.onboarding_completed,
  };
});

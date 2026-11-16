import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv, getSupabaseSecretKey } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Cliente con la clave secreta. SALTA la seguridad por fila, así que:
 *  - solo existe en el servidor ("server-only" rompe la compilación si llega al navegador);
 *  - se usa únicamente para lo que un usuario normal no puede hacer, como crear cuentas.
 * Nunca lo uses para leer o escribir datos de un usuario: para eso está ./server.ts.
 */
export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  return createClient<Database>(url, getSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

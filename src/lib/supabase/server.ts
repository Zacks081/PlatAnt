import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Cliente de Supabase para el servidor, con la sesión del usuario que hace la petición.
 * Todo lo que consulte pasa por la seguridad por fila: solo ve las filas de ese usuario.
 * Se crea uno nuevo en cada petición.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Desde un componente de servidor no se pueden escribir cookies.
          // No pasa nada: src/proxy.ts renueva la sesión en cada petición.
        }
      },
    },
  });
}

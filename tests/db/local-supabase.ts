import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Conexión a la copia LOCAL de Supabase (la que levanta `pnpm db:start` con Docker).
 * Estas pruebas nunca tocan el proyecto real: las direcciones y claves salen del
 * Supabase local, y se niegan a correr si la dirección no es de este computador.
 */
function readLocalStatus() {
  let output: string;
  try {
    output = execSync("pnpm exec supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("El Supabase local no está corriendo. Abre Docker y corre `pnpm db:start`.");
  }

  const values = Object.fromEntries(
    [...output.matchAll(/^([A-Z_]+)="?([^"\r\n]*)"?$/gm)].map((match) => [match[1], match[2]]),
  );
  const url = values.API_URL;
  const publishableKey = values.PUBLISHABLE_KEY ?? values.ANON_KEY;
  const secretKey = values.SECRET_KEY ?? values.SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !secretKey) {
    throw new Error("No se pudieron leer las claves del Supabase local.");
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`Estas pruebas solo corren contra el Supabase local, no contra ${url}.`);
  }
  return { url, publishableKey, secretKey };
}

const local = readLocalStatus();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export type TestClient = SupabaseClient<Database>;

/** Cliente con la clave secreta: salta la seguridad por fila. Solo para preparar y revisar. */
export const admin: TestClient = createClient<Database>(local.url, local.secretKey, clientOptions);

/** Cliente sin sesión, como alguien que llama al servicio desde afuera. */
export function anonymousClient(): TestClient {
  return createClient<Database>(local.url, local.publishableKey, clientOptions);
}

export const TEST_PASSWORD = "clave-de-prueba-123";
const createdUserIds: string[] = [];

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@prueba.example.com`;
}

/** Crea una cuenta y devuelve un cliente con su sesión abierta, como lo vería esa persona. */
export async function createTestUser(name: string) {
  const email = uniqueEmail(name.toLowerCase());
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user)
    throw new Error(`No se pudo crear el usuario de prueba: ${error?.message}`);
  createdUserIds.push(data.user.id);

  const client = anonymousClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw new Error(`No se pudo abrir la sesión de prueba: ${signInError.message}`);

  return { id: data.user.id, email, client };
}

/** Anota una cuenta creada por fuera de createTestUser para borrarla al final. */
export function trackUser(id: string) {
  createdUserIds.push(id);
}

export async function deleteTestUsers() {
  await Promise.all(createdUserIds.splice(0).map((id) => admin.auth.admin.deleteUser(id)));
}

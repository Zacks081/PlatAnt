import "server-only";

import { cookies } from "next/headers";

/** Nombre de la cookie del aviso corto que se muestra después de guardar algo. */
export const FLASH_COOKIE = "platant-aviso";

/**
 * Deja un aviso para la próxima pantalla («Gasto de $18.000 guardado»). Lo lee y lo borra
 * el componente Toast, en el navegador. Dura medio minuto como máximo.
 */
export async function setFlash(message: string) {
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(message), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
  });
}

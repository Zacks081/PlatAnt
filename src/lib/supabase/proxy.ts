import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env";

/** Páginas que se pueden abrir sin sesión. Todo lo demás pide entrar. */
const PUBLIC_PATHS = ["/entrar", "/registro", "/recuperar", "/auth/confirm"];
/** Páginas que no tienen sentido con la sesión ya abierta. */
const GUEST_ONLY_PATHS = ["/entrar", "/registro", "/recuperar"];

const matches = (pathname: string, paths: string[]) =>
  paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * Corre antes de cada página: renueva la sesión si está por vencer y decide si
 * la persona puede seguir. Es el primer filtro; cada página y cada acción
 * vuelven a comprobar la sesión por su cuenta (ver src/lib/auth/session.ts).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // La sesión renovada va a la petición (para las páginas) y a la respuesta (para el navegador).
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Evita que algún intermediario guarde una respuesta con la sesión de alguien.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims comprueba la firma de la sesión; no confía en la cookie tal cual.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    const redirect = NextResponse.redirect(target);
    // Conserva las cookies y cabeceras de la sesión recién renovada.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirect.headers.set(header, value);
    }
    return redirect;
  };

  if (!isSignedIn && !matches(pathname, PUBLIC_PATHS)) return redirectTo("/entrar");
  if (isSignedIn && matches(pathname, GUEST_ONLY_PATHS)) return redirectTo("/");

  return response;
}

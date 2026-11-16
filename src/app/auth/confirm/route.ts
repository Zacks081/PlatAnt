import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["recovery"];

/**
 * A donde llega el enlace del correo de "recuperar contraseña".
 * Cambia el código del enlace por una sesión y manda a elegir la contraseña nueva.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const target = request.nextUrl.clone();
  target.search = "";
  target.pathname = "/enlace-vencido";

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) target.pathname = safeNextPath(searchParams.get("next"), "/nueva-contrasena");
  }

  return NextResponse.redirect(target);
}

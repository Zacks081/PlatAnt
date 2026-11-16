import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Todo menos los archivos estáticos, las imágenes, los íconos y el manifiesto de la app.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|icons/|marca/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

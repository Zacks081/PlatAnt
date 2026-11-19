"use client";

import { Check } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const FLASH_COOKIE = "platant-aviso";

function takeFlash(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${FLASH_COOKIE}=([^;]*)`));
  if (!match) return null;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  try {
    return decodeURIComponent(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/** Aviso corto arriba de la pantalla después de guardar algo. Se va solo a los 3 segundos. */
export function Toast() {
  const pathname = usePathname();
  // Una acción que vuelve a la misma pantalla (como «Ya pagué») cambia solo los parámetros.
  const search = useSearchParams().toString();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Leer la cookie solo se puede en el navegador; el aviso aparece justo después de cargar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(takeFlash());
  }, [pathname, search]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      {message && (
        <p className="flex items-center gap-2 rounded-full border border-estado-bueno-borde bg-estado-bueno-fondo px-4 py-2.5 text-sm font-semibold shadow-lg animate-in fade-in slide-in-from-top-2">
          <Check aria-hidden="true" className="size-4 text-libre" />
          {message}
        </p>
      )}
    </div>
  );
}

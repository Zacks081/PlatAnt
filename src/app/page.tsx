import Image from "next/image";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { appConfig } from "@/config/app";
import { getCurrentUser } from "@/lib/auth/session";

import { signOut } from "./(auth)/actions";

/**
 * Inicio provisional. Confirma que la sesión y el perfil funcionan;
 * el inicio de verdad (balance, libre para gastar) llega con las issues siguientes.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-10">
      <Image
        src="/marca/logo-principal.png"
        alt={appConfig.name.full}
        width={1200}
        height={310}
        sizes="280px"
        priority
        className="mx-auto mb-7 h-auto w-full max-w-[280px]"
      />

      {/* Leer la sesión depende de cada petición, así que va detrás de Suspense. */}
      <Suspense fallback={<div aria-hidden="true" className="h-[138px] rounded-lg bg-card" />}>
        <Welcome />
      </Suspense>

      <form action={signOut} className="mt-2">
        <Button type="submit" variant="outline" className="w-full">
          Cerrar sesión
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Wordmark className="text-foreground" /> · pantalla provisional
      </p>
    </main>
  );
}

async function Welcome() {
  const user = await getCurrentUser();

  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-estado-bueno-borde bg-estado-bueno-fondo px-5 pt-[22px] pb-5">
      <p className="text-estado-bueno-texto">Tu cuenta está lista</p>
      <p className="font-display text-[40px] leading-none font-bold tracking-[-0.03em] break-words">
        Hola, {user.name}
      </p>
      <p className="mt-1 text-sm text-estado-bueno-texto">
        <span className="font-semibold text-estado-bueno">Entraste bien</span> · falta configurar tu
        plata
      </p>
    </section>
  );
}

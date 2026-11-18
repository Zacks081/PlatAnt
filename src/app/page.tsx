import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { appConfig } from "@/config/app";
import { requireOnboardedUser } from "@/lib/auth/session";
import { SETTINGS_PATH } from "@/lib/onboarding/steps";

/**
 * Inicio provisional. Confirma que la sesión, el perfil y la configuración inicial funcionan;
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

      <Link
        href={SETTINGS_PATH}
        className={buttonVariants({ variant: "outline", className: "mt-2 w-full" })}
      >
        Ajustes
      </Link>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Wordmark className="text-foreground" /> · pantalla provisional
      </p>
    </main>
  );
}

async function Welcome() {
  // Quien no ha terminado la configuración inicial va primero al recorrido.
  const user = await requireOnboardedUser();

  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-estado-bueno-borde bg-estado-bueno-fondo px-5 pt-[22px] pb-5">
      <p className="text-estado-bueno-texto">Tu cuenta está lista</p>
      <p className="font-display text-[40px] leading-none font-bold tracking-[-0.03em] break-words">
        Hola, {user.name}
      </p>
      <p className="mt-1 text-sm text-estado-bueno-texto">
        <span className="font-semibold text-estado-bueno">Ya configuraste tu plata</span> · lo demás
        llega pronto
      </p>
    </section>
  );
}

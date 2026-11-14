import Image from "next/image";

import { Wordmark } from "@/components/wordmark";
import { appConfig } from "@/config/app";
import { formatMoney } from "@/lib/money";

const colorMeanings = [
  { name: "Libre", dotClass: "bg-libre" },
  { name: "Apartado", dotClass: "bg-apartado" },
  { name: "Gastado", dotClass: "bg-gasto" },
];

/**
 * Pantalla provisional. Solo confirma que la base carga: logo, colores,
 * letras y formato de plata. El inicio de verdad llega con las issues siguientes.
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

      <section className="flex flex-col gap-1.5 rounded-lg border border-estado-bueno-borde bg-estado-bueno-fondo px-5 pt-[22px] pb-5">
        <p className="text-estado-bueno-texto">Así se va a ver tu plata</p>
        <p className="font-display text-[52px] leading-none font-bold tracking-[-0.03em]">
          {formatMoney(1_200_000)}
        </p>
        <p className="mt-1 text-sm text-estado-bueno-texto">
          <span className="font-semibold text-estado-bueno">La base está lista</span> · todo cargó
          bien
        </p>
      </section>

      <section className="flex flex-col gap-3.5 rounded-lg bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Los colores de la app</h2>
        <ul className="grid grid-cols-3 gap-2">
          {colorMeanings.map((color) => (
            <li key={color.name} className="flex items-center gap-1.5 text-sm">
              <span aria-hidden="true" className={`size-2 rounded-full ${color.dotClass}`} />
              {color.name}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Wordmark className="text-foreground" /> · pantalla provisional
      </p>
    </main>
  );
}

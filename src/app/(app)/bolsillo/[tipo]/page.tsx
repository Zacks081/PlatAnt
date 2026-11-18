import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MovementList } from "@/components/movements/movement-list";
import { BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { buttonVariants } from "@/components/ui/button";
import { todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getBalances, getMovements, getPockets, openApp } from "@/lib/movements/data";
import { POCKET_NOUNS, POCKET_PATHS, pocketFromSlug } from "@/lib/pockets/pockets";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bolsillo" };

type Props = Pick<PageProps<"/bolsillo/[tipo]">, "params">;

/** Un bolsillo (la cuenta o el efectivo): su saldo, el cuadre y sus últimos movimientos. */
export default function PocketPage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Pocket params={params} />
    </Suspense>
  );
}

async function Pocket({ params }: Props) {
  const kind = pocketFromSlug((await params).tipo);
  if (!kind) notFound();

  const { user, db } = await openApp();
  const pockets = await getPockets(db);
  const pocketId = pockets.find((pocket) => pocket.kind === kind)?.id;
  if (!pocketId) notFound();

  const filters = { range: null, type: null, categoryId: null, pocketId };
  const [balances, recent] = await Promise.all([getBalances(db), getMovements(db, filters, 5)]);
  const balance = balances[kind];
  const nouns = POCKET_NOUNS[kind];
  const isNegative = balance < 0;
  const path = POCKET_PATHS[kind];

  return (
    <Screen>
      <header className="flex min-h-11 items-center gap-3">
        <BackLink href="/" label="Volver al inicio" />
        <h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">{nouns.name}</h1>
      </header>

      {/* En negativo, la tarjeta toma el color de alerta y explica qué hacer. */}
      <section
        className={cn(
          "flex flex-col gap-1 rounded-[28px] border p-5",
          isNegative
            ? "border-estado-malo-borde bg-estado-malo-fondo"
            : "border-transparent bg-card",
        )}
      >
        <p className={isNegative ? "text-estado-malo-texto" : "text-muted-foreground"}>
          {kind === "account" ? "Tienes en la cuenta" : "Tienes en efectivo"}
        </p>
        <p className="font-display text-[clamp(40px,13vw,52px)] leading-[1.05] font-bold tracking-[-0.03em] tabular-nums">
          {formatMoney(balance, { currency: user.currency })}
        </p>
        <p
          className={cn(
            "mt-1 text-sm",
            isNegative ? "text-estado-malo-texto" : "text-muted-foreground",
          )}
        >
          {isNegative ? (
            <>
              <span className="font-semibold text-estado-malo">Estás en negativo.</span> Seguro
              falta registrar algo. Cuadra el saldo con lo que tienes de verdad.
            </>
          ) : (
            "Es lo que calcula la app con tus movimientos. Si no coincide con lo que tienes, cuadra el saldo."
          )}
        </p>
        <Link
          href={`/cuadrar/${kind === "account" ? "cuenta" : "efectivo"}`}
          className={cn(buttonVariants({ size: "lg" }), "mt-4 w-full")}
        >
          Cuadrar saldo
        </Link>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="font-display text-lg font-semibold">
            {kind === "account" ? "Movimientos de la cuenta" : "Movimientos del efectivo"}
          </h2>
          {recent.length > 0 && (
            <Link
              href={`/movimientos?bolsillo=${pocketId}`}
              className="flex h-11 items-center rounded-full px-2 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Ver todos
            </Link>
          )}
        </div>
        {recent.length > 0 ? (
          <MovementList
            movements={recent}
            today={todayInTimeZone(user.timeZone)}
            currency={user.currency}
            back={path}
          />
        ) : (
          <p className="rounded-[24px] bg-card p-5 text-muted-foreground">
            Todavía no hay movimientos en {nouns.the}.
          </p>
        )}
      </section>
    </Screen>
  );
}

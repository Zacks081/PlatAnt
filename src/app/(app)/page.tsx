import { Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { MovementList } from "@/components/movements/movement-list";
import { Screen, ScreenFallback } from "@/components/onboarding/screen";
import { Wordmark } from "@/components/wordmark";
import { todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getBalances, getMovements, openApp } from "@/lib/movements/data";
import { SETTINGS_PATH } from "@/lib/onboarding/steps";

/**
 * Inicio. Por ahora: lo que tienes (la cifra principal) y los últimos movimientos.
 * «Hoy puedes gastar» y «Lo que viene» llegan con sus issues.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const { user, db } = await openApp();
  const [balances, recent] = await Promise.all([getBalances(db), getMovements(db, undefined, 5)]);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });

  return (
    <Screen>
      <header className="flex min-h-11 items-center justify-between gap-3 pl-1">
        <Wordmark className="text-xl" />
        <Link
          href={SETTINGS_PATH}
          aria-label="Ajustes"
          className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Settings aria-hidden="true" className="size-5" />
        </Link>
      </header>

      <section className="flex flex-col gap-1 rounded-[28px] bg-card p-5">
        <p className="text-muted-foreground">Hola, {user.name}. Tienes</p>
        <p className="font-display text-[clamp(40px,13vw,52px)] leading-[1.05] font-bold tracking-[-0.03em] tabular-nums">
          {money(balances.total)}
        </p>
        <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-border pt-3.5">
          {(
            [
              ["En la cuenta", balances.account],
              ["En efectivo", balances.cash],
            ] as const
          ).map(([label, amount]) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="font-display text-xl font-bold tabular-nums">{money(amount)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="font-display text-lg font-semibold">Últimos movimientos</h2>
          {recent.length > 0 && (
            <Link
              href="/movimientos"
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
            back="/"
          />
        ) : (
          <p className="rounded-[24px] bg-card p-5 text-muted-foreground">
            Todavía no has registrado movimientos. Toca el botón + para agregar el primero.
          </p>
        )}
      </section>
    </Screen>
  );
}

import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { MovementList } from "@/components/movements/movement-list";
import { Screen, ScreenFallback } from "@/components/onboarding/screen";
import { Wordmark } from "@/components/wordmark";
import { todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getBalances, getMovements, openApp } from "@/lib/movements/data";
import { POCKET_NOUNS, POCKET_PATHS } from "@/lib/pockets/pockets";
import { SETTINGS_PATH } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

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
  const pockets = [
    { kind: "account", label: "En la cuenta", amount: balances.account },
    { kind: "cash", label: "En efectivo", amount: balances.cash },
  ] as const;
  // Un bolsillo puede quedar en negativo: se avisa, pero no se bloquea.
  const negative = pockets.filter((pocket) => pocket.amount < 0);

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
        <ul className="mt-3.5 grid grid-cols-2 gap-3 border-t border-border pt-3.5">
          {pockets.map((pocket) => (
            <li key={pocket.kind} className="min-w-0">
              {/* Cada bolsillo abre su pantalla, con su saldo, sus movimientos y el cuadre. */}
              <Link
                href={POCKET_PATHS[pocket.kind]}
                className="-m-2 flex min-w-0 flex-col gap-0.5 rounded-2xl p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex items-center gap-0.5 text-[13px] text-muted-foreground">
                  {pocket.label}
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </span>
                <span
                  className={cn(
                    "font-display text-xl font-bold tabular-nums",
                    pocket.amount < 0 && "text-gasto",
                  )}
                >
                  {money(pocket.amount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {negative.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-semibold text-gasto">
              {negative.length > 1
                ? "Tu cuenta y tu efectivo están en negativo."
                : `${capitalize(POCKET_NOUNS[negative[0].kind].your)} está en negativo.`}
            </span>{" "}
            Seguro falta registrar algo; tócalo para cuadrarlo.
          </p>
        )}
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

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

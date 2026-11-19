import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { MovementList } from "@/components/movements/movement-list";
import { Screen, ScreenFallback } from "@/components/onboarding/screen";
import { Wordmark } from "@/components/wordmark";
import { buttonVariants } from "@/components/ui/button";
import { formatIsoDate, todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { onDayLabel } from "@/lib/movements/format";
import { getBalances, getMovements, openApp } from "@/lib/movements/data";
import { SETTINGS_PATH } from "@/lib/onboarding/steps";
import { getPayOverview } from "@/lib/pay-periods/data";
import {
  inDaysLabel,
  paidCountLabel,
  PERIOD_WORDS,
  QUINCENA_PATH,
} from "@/lib/pay-periods/summary";
import { POCKET_NOUNS, POCKET_PATHS } from "@/lib/pockets/pockets";
import { cn } from "@/lib/utils";

/**
 * Inicio. Por ahora: lo que tienes (la cifra principal), la quincena y los últimos movimientos.
 * «Hoy puedes gastar» llega con la issue 7.
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
  const [balances, recent, pay] = await Promise.all([
    getBalances(db),
    getMovements(db, undefined, 5),
    getPayOverview(db, user),
  ]);
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
                className="flex min-w-0 flex-col gap-0.5 rounded-[12px] border border-border px-3 py-2.5 outline-none hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-secondary"
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

      <PayPeriodCard overview={pay} money={money} title={PERIOD_WORDS[user.payFrequency].title} />

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

/**
 * La quincena en una tarjeta: cuándo llega el próximo pago y cuánto está apartado. Cuando el
 * pago ya debería haber llegado (o antes del primero), pregunta si ya te pagaron.
 */
function PayPeriodCard({
  overview: { today, period, totals, next },
  money,
  title,
}: {
  overview: Awaited<ReturnType<typeof getPayOverview>>;
  money: (amount: number) => string;
  title: string;
}) {
  const nextIso = formatIsoDate(next.date);
  const nextOn = onDayLabel(nextIso, today);

  if (!period || next.due) {
    return (
      <section className="flex flex-col gap-3 rounded-[28px] bg-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">¿Ya te pagaron?</h2>
          {period && (
            <Link
              href={QUINCENA_PATH}
              className="-my-2 rounded-full px-2 py-2 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {title}
            </Link>
          )}
        </div>
        <p className="-mt-1.5 text-muted-foreground">
          {!period
            ? `Regístralo para empezar a apartar. Lo esperamos ${nextOn}${next.days > 0 ? `, ${inDaysLabel(next.days)}` : ""}.`
            : next.days === 0
              ? "Según tus días de pago, te pagan hoy."
              : `Lo esperábamos ${nextOn}.`}
        </p>
        <Link
          href={`/me-pagaron?volver=${encodeURIComponent("/")}`}
          className={buttonVariants({ className: "w-full" })}
        >
          Me pagaron
        </Link>
      </section>
    );
  }

  return (
    <Link
      href={QUINCENA_PATH}
      className="flex flex-col gap-1 rounded-[28px] bg-card p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-secondary"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-display text-lg font-semibold">{title}</span>
        <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <span className="text-muted-foreground">
        Te pagan {nextOn}, {inDaysLabel(next.days)}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border pt-3">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-apartado" />
          <span className="text-muted-foreground">Apartado</span>
          <span className="font-display font-bold tabular-nums">{money(totals.setAside)}</span>
        </span>
        <span className="text-[13px] text-muted-foreground">
          · {paidCountLabel(totals.paidCount, totals.count)}
        </span>
      </span>
    </Link>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryIcon } from "@/components/movements/category-icon";
import { BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { compareDates, formatIsoDate, parseIsoDate, type CalendarDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { openApp } from "@/lib/movements/data";
import { dayLabel, onDayLabel } from "@/lib/movements/format";
import { stepPath } from "@/lib/onboarding/steps";
import { getPayOverview, type FixedExpenseItem } from "@/lib/pay-periods/data";
import { inDaysLabel, PERIOD_WORDS, QUINCENA_PATH } from "@/lib/pay-periods/summary";
import { fixedPocketPath, pocketProgress } from "@/lib/pockets/fixed";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Quincena" };

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * La quincena en curso: cuánto llegó, cuándo llega el próximo pago y, por cada gasto fijo,
 * cuánto tiene su bolsillo, qué ya se pagó y qué falta.
 */
export default function PayPeriodPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <PayPeriod />
    </Suspense>
  );
}

async function PayPeriod() {
  const { user, db } = await openApp();
  const { today, period, items, pocketTotals, next } = await getPayOverview(db, user);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });
  const words = PERIOD_WORDS[user.payFrequency];
  const nextOn = onDayLabel(formatIsoDate(next.date), today);

  return (
    <Screen>
      <header className="flex min-h-11 items-center gap-3">
        <BackLink href="/" label="Volver al inicio" />
        <h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">{words.title}</h1>
      </header>

      {period ? (
        <section className="flex flex-col gap-1 rounded-[28px] bg-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-muted-foreground">
              Recibiste {onDayLabel(period.started_on, today)}
            </p>
            <Link
              href={`/movimiento/${period.movement_id}?volver=${encodeURIComponent(QUINCENA_PATH)}`}
              className={cn("-my-2 rounded-full px-2 py-2 text-sm font-semibold", focusRing)}
            >
              Corregir
            </Link>
          </div>
          <p className="font-display text-[clamp(40px,13vw,52px)] leading-[1.05] font-bold tracking-[-0.03em] tabular-nums">
            {money(period.amount_received)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {next.due
              ? `El próximo pago se esperaba ${nextOn}. Cuando llegue, regístralo en Inicio.`
              : `Te pagan otra vez ${nextOn}, ${inDaysLabel(next.days)}.`}
          </p>
          {/* Las tres cifras son solo de los gastos fijos, no de toda la plata de la quincena. */}
          <h2 className="mt-3.5 border-t border-border pt-3.5 text-sm font-semibold">
            Gastos fijos
          </h2>
          <dl className="mt-2 grid grid-cols-3 gap-3">
            {(
              [
                ["En bolsillos", pocketTotals.inPockets, "bg-apartado"],
                ["Pagado", pocketTotals.paid, "bg-libre"],
                ["Falta", pocketTotals.missing, "bg-foreground"],
              ] as const
            ).map(([label, amount, dot]) => (
              <div key={label} className="flex min-w-0 flex-col gap-0.5">
                <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
                  {label}
                </dt>
                <dd className="truncate font-display text-base font-bold tabular-nums">
                  {money(amount)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <section className="flex flex-col gap-2 rounded-[28px] bg-card p-5">
          <p className="font-display text-xl font-semibold">Todavía no has registrado un pago</p>
          <p className="text-muted-foreground">
            Esperamos tu próximo pago {nextOn}
            {next.days > 0 ? `, ${inDaysLabel(next.days)}` : ""}. Cuando te paguen, regístralo en
            Inicio: desde ahí la app aparta lo de tus gastos fijos.
          </p>
        </section>
      )}

      {period && (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 font-display text-lg font-semibold">Bolsillos</h2>
          {items.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-4">
              {items.map((item) => (
                <PocketItem key={item.fixedExpenseId} item={item} today={today} money={money} />
              ))}
            </ul>
          ) : (
            <p className="rounded-[24px] bg-card p-5 text-muted-foreground">
              {words.the.charAt(0).toUpperCase() + words.the.slice(1)} no tiene gastos fijos que
              apartar.{" "}
              <Link href={stepPath(3)} className="font-semibold text-foreground underline">
                Revisa tus gastos fijos
              </Link>
              .
            </p>
          )}
        </section>
      )}
    </Screen>
  );
}

/** Un gasto fijo de la quincena: su bolsillo, cuánto tiene y cuánto falta, o cuándo se pagó. */
function PocketItem({
  item,
  today,
  money,
}: {
  item: FixedExpenseItem;
  today: CalendarDate;
  money: (amount: number) => string;
}) {
  const isPaid = item.paidAmount !== null;
  const overdue = !isPaid && compareDates(parseIsoDate(item.dueOn)!, today) < 0;
  const when = dayLabel(item.dueOn, today);
  const progress = pocketProgress(item.balance, item.total);

  return (
    <li className="flex flex-col gap-2.5 py-3.5">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={item.icon} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-semibold">{item.name}</span>
          <span className={cn("text-[13px] text-muted-foreground", overdue && "text-gasto")}>
            {overdue
              ? `Venció ${onDayLabel(item.dueOn, today)}`
              : `Vence ${when.charAt(0).toLowerCase()}${when.slice(1)}`}
          </span>
        </span>
        {item.hasPocket && (
          <Link
            href={fixedPocketPath(item.fixedExpenseId)}
            className={cn(
              // Negro sobre la tarjeta, con borde claro: se ve que es un botón sin el verde.
              "flex h-11 shrink-0 items-center rounded-full border border-foreground/25 bg-background px-4 text-sm font-semibold text-foreground active:bg-secondary",
              focusRing,
            )}
          >
            Ver bolsillo
          </Link>
        )}
      </div>
      {isPaid ? (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-libre">
          <Check aria-hidden="true" className="size-3.5" />
          Pagado {item.paidOn ? onDayLabel(item.paidOn, today) : ""} · {money(item.paidAmount!)}
        </p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${money(item.balance)} de ${money(item.total)} en el bolsillo`}
            className="flex h-2 overflow-hidden rounded-full bg-border"
          >
            <span
              className="rounded-full bg-apartado"
              style={{ width: `${Math.round(progress.filled * 100)}%` }}
            />
          </div>
          <p className="flex items-center justify-between gap-3 text-[13px]">
            {/* Lo que tiene el bolsillo frente al valor del gasto. */}
            <span className="min-w-0 truncate text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{money(item.balance)}</span> de{" "}
              {money(item.total)}
            </span>
            {progress.ready ? (
              <span className="shrink-0 font-semibold text-libre">Listo para pagar</span>
            ) : (
              <span className="shrink-0 font-semibold text-apartado tabular-nums">
                Falta {money(progress.missing)}
              </span>
            )}
          </p>
        </>
      )}
    </li>
  );
}

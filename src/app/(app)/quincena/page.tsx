import { Check, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryIcon } from "@/components/movements/category-icon";
import { BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { buttonVariants } from "@/components/ui/button";
import { compareDates, formatIsoDate, parseIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { dayLabel, onDayLabel } from "@/lib/movements/format";
import { openApp } from "@/lib/movements/data";
import { stepPath } from "@/lib/onboarding/steps";
import { getPayOverview, type SetAsideRow } from "@/lib/pay-periods/data";
import { inDaysLabel, PERIOD_WORDS, QUINCENA_PATH } from "@/lib/pay-periods/summary";
import { cn } from "@/lib/utils";

import { paySetAside } from "./actions";

export const metadata: Metadata = { title: "Quincena" };

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const PAYDAY_PATH = `/me-pagaron?volver=${encodeURIComponent(QUINCENA_PATH)}`;

/**
 * La quincena en curso: cuánto llegó, cuándo llega el próximo pago y qué está apartado,
 * qué ya se pagó y qué falta.
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
  const { today, period, setAsides, totals, next } = await getPayOverview(db, user);
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
            {next.due ? (
              <>
                <span className="font-semibold text-libre">¿Ya te pagaron?</span> El próximo pago se
                esperaba {nextOn}.
              </>
            ) : (
              `Te pagan otra vez ${nextOn}, ${inDaysLabel(next.days)}.`
            )}
          </p>
          <dl className="mt-3.5 grid grid-cols-3 gap-3 border-t border-border pt-3.5">
            {(
              [
                ["Apartado", totals.setAside, "bg-apartado"],
                ["Pagado", totals.paid, "bg-muted-foreground"],
                ["Falta", totals.pending, "bg-foreground"],
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
            {next.days > 0 ? `, ${inDaysLabel(next.days)}` : ""}. Cuando te paguen, regístralo:
            desde ahí la app aparta lo de tus gastos fijos.
          </p>
        </section>
      )}

      {period && (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 font-display text-lg font-semibold">Apartados</h2>
          {setAsides.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-4">
              {setAsides.map((row) => (
                <SetAsideItem key={row.id} row={row} today={today} money={money} />
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
          <p className="px-1 text-[13px] text-muted-foreground">
            Lo apartado sigue en tu cuenta, pero no está libre para gastar.
          </p>
        </section>
      )}

      <div className="mt-auto pt-2">
        <Link
          href={PAYDAY_PATH}
          // Con cn, el borde del botón de contorno le gana al borde transparente de la base.
          className={cn(
            buttonVariants({ variant: !period || next.due ? "default" : "outline", size: "lg" }),
            "w-full",
          )}
        >
          Me pagaron
        </Link>
      </div>
    </Screen>
  );
}

function SetAsideItem({
  row,
  today,
  money,
}: {
  row: SetAsideRow;
  today: { year: number; month: number; day: number };
  money: (amount: number) => string;
}) {
  const fixed = row.fixed_expenses;
  const name = fixed?.name ?? "Gasto fijo";
  const isPaid = row.paid_movement_id !== null;
  const due = parseIsoDate(row.due_on)!;
  const overdue = !isPaid && compareDates(due, today) < 0;
  const when = dayLabel(row.due_on, today);
  // Con «mitad y mitad», esta quincena aparta solo una parte.
  const part = fixed && row.amount < fixed.amount ? ` · parte de ${money(fixed.amount)}` : "";

  const details = (
    <>
      <CategoryIcon icon={fixed?.categories?.icon} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold">{name}</span>
        <span className={cn("text-[13px] text-muted-foreground", overdue && "text-gasto")}>
          {overdue
            ? `Venció ${onDayLabel(row.due_on, today)}`
            : `Vence ${when.charAt(0).toLowerCase()}${when.slice(1)}`}
          {part}
        </span>
      </span>
    </>
  );
  const amount = (
    <span className="font-display text-base font-semibold tabular-nums">{money(row.amount)}</span>
  );

  if (isPaid) {
    // Lo pagado abre el gasto que se registró: ahí se corrige o se borra (y vuelve a pendiente).
    return (
      <li>
        <Link
          href={`/movimiento/${row.paid_movement_id}?volver=${encodeURIComponent(QUINCENA_PATH)}`}
          className={cn("flex min-h-16 items-center gap-3 rounded-lg py-2.5", focusRing)}
        >
          {details}
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            {amount}
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <Check aria-hidden="true" className="size-3.5" />
              Pagado
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </span>
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li className="flex min-h-16 items-center gap-3 py-2.5">
      {details}
      <span className="flex shrink-0 flex-col items-end gap-1">
        {amount}
        <form action={paySetAside.bind(null, row.id)}>
          <button
            type="submit"
            className={cn(
              "flex h-11 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-semibold",
              focusRing,
            )}
          >
            <Check aria-hidden="true" className="size-4" />
            Ya pagué
          </button>
        </form>
      </span>
    </li>
  );
}

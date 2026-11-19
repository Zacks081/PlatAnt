import { Check, Minus, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { openApp } from "@/lib/movements/data";
import { dayLabel, onDayLabel } from "@/lib/movements/format";
import { safeReturnPath } from "@/lib/movements/validation";
import { instanceFromRow } from "@/lib/pay-periods/schedule";
import { payOptionLabel, QUINCENA_PATH } from "@/lib/pay-periods/summary";
import {
  fixedPocketPath,
  pocketDue,
  pocketMovementLabel,
  pocketProgress,
} from "@/lib/pockets/fixed";
import { getFixedPocket } from "@/lib/pockets/fixed-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Bolsillo" };

type Props = Pick<PageProps<"/bolsillos/[id]">, "params" | "searchParams">;

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * El bolsillo de un gasto fijo: cuánto tiene frente al valor del gasto, apartar, sacar o pagar,
 * y sus movimientos.
 */
export default function FixedPocketPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <FixedPocket params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FixedPocket({ params, searchParams }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const back = safeReturnPath([(await searchParams).volver].flat()[0] ?? QUINCENA_PATH);

  const { user, db } = await openApp();
  const pocket = await getFixedPocket(db, id);
  if (!pocket) notFound();

  const today = todayInTimeZone(user.timeZone);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });
  const { fixed, balance } = pocket;
  const progress = pocketProgress(balance, fixed.amount);
  // Un pago por mes: si ya se pagó este mes, no falta nada hasta el mes siguiente.
  const lastPayment = pocket.movements.find((movement) => movement.kind === "expense");
  const { dueOn, paidThisMonth } = pocketDue(today, fixed.due_day, {
    unpaidDueOn: pocket.nextDueOn,
    lastPaymentOn: lastPayment?.occurred_on ?? null,
  });
  const path = fixedPocketPath(id);

  const actions = [
    { slug: "apartar", label: "Apartar", Icon: Plus },
    { slug: "sacar", label: "Sacar", Icon: Minus },
    { slug: "pagar", label: "Pagar", Icon: Check },
  ] as const;

  return (
    <Screen>
      <ItemHeader backHref={back} title={fixed.name} />

      <section className="flex flex-col gap-1.5 rounded-[28px] bg-card p-5">
        <p className="text-muted-foreground">En el bolsillo</p>
        <p
          className={cn(
            "font-display text-[clamp(40px,13vw,52px)] leading-[1.05] font-bold tracking-[-0.03em] tabular-nums",
            balance < 0 && "text-gasto",
          )}
        >
          {money(balance)}
        </p>
        <p className="text-sm text-muted-foreground">
          de {money(fixed.amount)} · {paidThisMonth ? "el próximo vence" : "vence"}{" "}
          {onDayLabel(dueOn, today)}
        </p>
        {paidThisMonth ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check aria-hidden="true" className="size-4 text-libre" />
            <span>
              <span className="font-semibold text-libre">Ya pagaste este mes.</span>{" "}
              {lastPayment ? `Pagado ${onDayLabel(lastPayment.occurred_on, today)}.` : ""}
            </span>
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label={`${money(balance)} de ${money(fixed.amount)}`}
              className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-border"
            >
              <span
                className="rounded-full bg-apartado"
                style={{ width: `${Math.round(progress.filled * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {progress.ready ? (
                <span className="font-semibold text-libre">Listo para pagar.</span>
              ) : (
                <>
                  <span className="font-semibold text-apartado tabular-nums">
                    Falta {money(progress.missing)}
                  </span>{" "}
                  para completar el pago.
                </>
              )}
            </p>
          </>
        )}
      </section>

      <nav aria-label="Qué hacer con el bolsillo" className="grid grid-cols-3 gap-2.5">
        {actions.map(({ slug, label, Icon }) => (
          <Link
            key={slug}
            href={`${path}/${slug}?volver=${encodeURIComponent(back)}`}
            className={cn(
              "flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-[22px] text-sm font-semibold",
              slug === "pagar"
                ? "bg-primary font-bold text-primary-foreground"
                : "bg-card active:bg-secondary",
              focusRing,
            )}
          >
            <Icon aria-hidden="true" className="size-[22px]" />
            {label}
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-2.5">
        <h2 className="px-1 font-display text-lg font-semibold">Movimientos</h2>
        {pocket.movements.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-4">
            {pocket.movements.map((movement) => {
              const { title, incoming } = pocketMovementLabel(movement, pocket.pocketId);
              const period = movement.pay_periods;
              const detail = [
                dayLabel(movement.occurred_on, today),
                movement.origin === "opening_balance"
                  ? "antes de la app"
                  : period
                    ? payOptionLabel(instanceFromRow(period), user.payDays).toLowerCase()
                    : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const content = (
                <>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{title}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{detail}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-display text-base font-semibold tabular-nums",
                      incoming ? "text-libre" : "text-foreground",
                    )}
                  >
                    {incoming ? "+" : "−"}
                    {money(movement.amount)}
                  </span>
                </>
              );
              // Lo que ya estaba apartado de antes no está en el historial: no se abre.
              return (
                <li key={movement.id}>
                  {movement.origin === "opening_balance" ? (
                    <div className="flex min-h-16 items-center justify-between gap-3 py-2.5">
                      {content}
                    </div>
                  ) : (
                    <Link
                      href={`/movimiento/${movement.id}?volver=${encodeURIComponent(path)}`}
                      className={cn(
                        "flex min-h-16 items-center justify-between gap-3 rounded-lg py-2.5",
                        focusRing,
                      )}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[24px] bg-card p-5 text-muted-foreground">
            Todavía no hay movimientos. Cuando te paguen, la quincena aparta aquí lo que le toca.
          </p>
        )}
      </section>
    </Screen>
  );
}

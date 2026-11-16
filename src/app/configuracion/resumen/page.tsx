import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { getSummary, openStep } from "@/lib/onboarding/data";
import type { EstimateState } from "@/lib/onboarding/estimate";
import { payDaysLabel } from "@/lib/onboarding/labels";
import {
  currentPath,
  LAST_STEP,
  SETTINGS_PATH,
  stepPath,
  type StepNumber,
} from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

import { finishOnboarding } from "../actions";

export const metadata: Metadata = { title: "Resumen" };

export default function SummaryPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Summary />
    </Suspense>
  );
}

/** Color y texto de la tarjeta principal según cómo queda el usuario. Lo decide el código. */
const STATES: Record<
  EstimateState,
  { card: string; support: string; accent: string; headline: string; rest: string }
> = {
  good: {
    card: "border-estado-bueno-borde bg-estado-bueno-fondo",
    support: "text-estado-bueno-texto",
    accent: "text-estado-bueno",
    headline: "Te alcanza",
    rest: "después de lo fijo, las cuotas y tu meta",
  },
  regular: {
    card: "border-estado-regular-borde bg-estado-regular-fondo",
    support: "text-estado-regular-texto",
    accent: "text-estado-regular",
    headline: "Vas justo",
    rest: "casi todo tu ingreso ya tiene destino",
  },
  bad: {
    card: "border-estado-malo-borde bg-estado-malo-fondo",
    support: "text-estado-malo-texto",
    accent: "text-estado-malo",
    headline: "No te alcanza",
    rest: "tus compromisos superan lo que te entra",
  },
};

async function Summary() {
  const { user, db } = await openStep(LAST_STEP);
  if (user.onboardingCompleted) redirect(SETTINGS_PATH);
  if (user.onboardingStep < LAST_STEP) redirect(currentPath(user));

  const summary = await getSummary(db, user);
  const { estimate } = summary;
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });
  const state = STATES[estimate.state];
  const isBiweekly = user.payFrequency === "biweekly";

  const rows: { step: StepNumber; label: string; detail: string; amount: string }[] = [
    {
      step: 1,
      label: "Ingreso al mes",
      detail: `${isBiweekly ? "Quincenal" : "Mensual"} · ${payDaysLabel(user.payDays)}`,
      amount: money(estimate.income),
    },
    {
      step: 2,
      label: "Tienes hoy",
      detail: "Cuenta y efectivo",
      amount: money(summary.balances.account + summary.balances.cash),
    },
    {
      step: 3,
      label: "Gastos fijos",
      detail:
        summary.fixedExpenses.length > 0 ? `${summary.fixedExpenses.length} al mes` : "Ninguno",
      amount: money(estimate.fixedExpenses),
    },
    {
      step: 4,
      label: "Tarjeta de crédito",
      detail: !summary.card
        ? "Sin registrar"
        : estimate.card > 0
          ? `Cuotas de ${money(estimate.card)} al mes`
          : "Sin cuotas en curso",
      amount: money(summary.balances.credit_card),
    },
    {
      step: 5,
      label: "Deudas",
      detail: estimate.debts > 0 ? `Cuotas de ${money(estimate.debts)} al mes` : "Ninguna",
      amount: money(summary.debts.reduce((total, debt) => total + debt.original_amount, 0)),
    },
    {
      step: 6,
      label: "Meta",
      detail: summary.goal ? `${money(estimate.goal)} al mes` : "Sin meta",
      amount: money(summary.goal?.target_amount ?? 0),
    },
  ];

  return (
    <Screen>
      <header className="flex min-h-11 items-center gap-3">
        <BackLink href={stepPath(LAST_STEP)} label="Volver al paso anterior" />
        <h1 className="font-display text-xl font-semibold">Así quedó tu plata</h1>
      </header>

      <section className={cn("flex flex-col gap-1 rounded-[28px] border p-5", state.card)}>
        <p className={state.support}>Te quedan libres al mes</p>
        <p className="font-display text-[clamp(38px,13vw,50px)] leading-[1.05] font-bold tracking-[-0.03em] tabular-nums">
          {money(estimate.free)}
        </p>
        <p className={cn("mt-2 text-sm", state.support)}>
          <span className={cn("font-semibold", state.accent)}>{state.headline}</span> · {state.rest}
        </p>
        {estimate.periods && (
          <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-white/10 pt-3.5">
            {(
              [
                ["Primera quincena", estimate.periods.first],
                ["Segunda quincena", estimate.periods.second],
              ] as const
            ).map(([label, amount]) => (
              <div key={label} className="flex min-w-0 flex-col gap-0.5">
                <dt className={cn("text-[13px]", state.support)}>{label}</dt>
                <dd className="font-display text-xl font-bold tabular-nums">{money(amount)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <ul className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
        {rows.map((row) => (
          <li key={row.step}>
            <Link
              href={stepPath(row.step)}
              className="flex min-h-[54px] items-center justify-between gap-3 rounded-lg py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex min-w-0 flex-col">
                <span>{row.label}</span>
                <span className="text-[13px] text-muted-foreground">{row.detail}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums">
                {row.amount}
                <ChevronRight aria-hidden="true" className="size-[18px] text-muted-foreground" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <form action={finishOnboarding} className="mt-auto pt-4">
        <Button type="submit" size="lg" className="w-full">
          Empezar
        </Button>
      </form>
    </Screen>
  );
}

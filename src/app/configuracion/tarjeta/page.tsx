import type { Metadata } from "next";
import { Suspense } from "react";

import { CardForm } from "@/components/onboarding/forms";
import { Screen, ScreenFallback, ScreenTitle, StepHeader } from "@/components/onboarding/screen";
import { formatMoney } from "@/lib/money";
import { cardDebt, getCard, openStep } from "@/lib/onboarding/data";
import { DEFAULT_MONTHLY_RATE, planMonthlyPayment } from "@/lib/onboarding/estimate";
import { installmentsLeft } from "@/lib/onboarding/labels";
import { stepPath, submitLabel } from "@/lib/onboarding/steps";

import { saveCard } from "../actions";

export const metadata: Metadata = { title: "Tarjeta de crédito" };

export default function CardPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Card />
    </Suspense>
  );
}

async function Card() {
  const { user, db } = await openStep(4);
  const card = await getCard(db);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });
  const plans = card?.plans ?? [];
  const debt = cardDebt(plans);

  return (
    <Screen>
      <StepHeader step={4} user={user} />
      <ScreenTitle title="Tu tarjeta de crédito" />
      {/* La «key» rearma el formulario cuando cambia lo guardado, para que muestre eso
          y no lo que tenía la última vez que se abrió. */}
      <CardForm
        key={`${card?.statement_day}-${card?.payment_day}-${card?.monthly_rate}-${card?.split}-${plans.length}-${debt}`}
        action={saveCard}
        submitLabel={submitLabel(user)}
        initial={{
          statementDay: card?.statement_day ?? 15,
          paymentDay: card?.payment_day ?? 30,
          // Solo se muestra la tasa si la escribió el usuario; el 3 % estimado se deja en blanco.
          monthlyRate:
            card && !card.rate_is_estimated ? String(card.monthly_rate).replace(".", ",") : "",
          split: card?.split ?? "half",
        }}
        askSplit={user.payFrequency === "biweekly"}
        plans={plans.map((plan) => ({
          href: `${stepPath(4)}/cuotas/${plan.id}`,
          name: plan.name,
          detail:
            plan.kind === "subscription"
              ? "Plan mensual"
              : `${installmentsLeft(plan.installments_count)} · cuota de ${money(
                  planMonthlyPayment(
                    {
                      kind: plan.kind,
                      principal: plan.principal,
                      installmentsCount: plan.installments_count,
                    },
                    Number(card?.monthly_rate ?? DEFAULT_MONTHLY_RATE),
                  ),
                )}`,
          amount: money(plan.principal),
        }))}
        debtTotal={debt > 0 ? money(debt) : null}
      />
    </Screen>
  );
}

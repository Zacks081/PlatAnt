import type { Metadata } from "next";
import { Suspense } from "react";

import { CardForm } from "@/components/onboarding/forms";
import { Screen, ScreenFallback, ScreenTitle, StepHeader } from "@/components/onboarding/screen";
import { formatMoney } from "@/lib/money";
import { getCard, getOpeningBalances, openStep } from "@/lib/onboarding/data";
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
  const [card, balances] = await Promise.all([getCard(db), getOpeningBalances(db)]);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });

  const debt = balances.credit_card;
  const inPlans = (card?.plans ?? []).reduce((sum, plan) => sum + plan.principal, 0);
  const remainder = debt - inPlans;

  return (
    <Screen>
      <StepHeader step={4} user={user} />
      <ScreenTitle title="Tu tarjeta de crédito" />
      {/* La «key» rearma el formulario cuando cambian los datos guardados (por ejemplo, al volver
          de agregar una cuota), para que muestre lo guardado y no lo que tenía antes. */}
      <CardForm
        key={`${debt}-${card?.plans.length ?? 0}-${card?.statement_day}-${card?.payment_day}`}
        action={saveCard}
        submitLabel={submitLabel(user)}
        initial={{
          statementDay: card?.statement_day ?? 15,
          paymentDay: card?.payment_day ?? 30,
          // Solo se muestra la tasa si la escribió el usuario; el 3 % estimado se deja en blanco.
          monthlyRate:
            card && !card.rate_is_estimated ? String(card.monthly_rate).replace(".", ",") : "",
          debt,
        }}
        plans={(card?.plans ?? []).map((plan) => ({
          href: `${stepPath(4)}/cuotas/${plan.id}`,
          name: plan.name,
          detail: installmentsLeft(plan.installments_count),
          amount: money(plan.principal),
        }))}
        remainderNote={
          card && remainder > 0 && inPlans > 0
            ? `Los otros ${money(remainder)} se pagan completos en el próximo corte.`
            : null
        }
      />
    </Screen>
  );
}

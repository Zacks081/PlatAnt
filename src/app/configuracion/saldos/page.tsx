import type { Metadata } from "next";
import { Suspense } from "react";

import { BalancesForm } from "@/components/onboarding/forms";
import { Screen, ScreenFallback, ScreenTitle, StepHeader } from "@/components/onboarding/screen";
import { getOpeningBalances, openStep } from "@/lib/onboarding/data";
import { submitLabel } from "@/lib/onboarding/steps";

import { saveBalances } from "../actions";

export const metadata: Metadata = { title: "Saldos de hoy" };

export default function BalancesPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Balances />
    </Suspense>
  );
}

async function Balances() {
  const { user, db } = await openStep(2);
  const balances = await getOpeningBalances(db);

  return (
    <Screen>
      <StepHeader step={2} user={user} />
      <ScreenTitle
        title="¿Cuánta plata tienes hoy?"
        description="Mira la app de tu banco y lo que tengas en la billetera."
      />
      <BalancesForm
        action={saveBalances}
        submitLabel={submitLabel(user)}
        initial={{ account: balances.account, cash: balances.cash }}
      />
    </Screen>
  );
}

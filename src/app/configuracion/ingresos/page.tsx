import type { Metadata } from "next";
import { Suspense } from "react";

import { IncomeForm } from "@/components/onboarding/forms";
import { Screen, ScreenFallback, ScreenTitle, StepHeader } from "@/components/onboarding/screen";
import { openStep } from "@/lib/onboarding/data";
import { submitLabel } from "@/lib/onboarding/steps";

import { saveIncome } from "../actions";

export const metadata: Metadata = { title: "Ingresos" };

export default function IncomePage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Income />
    </Suspense>
  );
}

async function Income() {
  const { user } = await openStep(1);

  return (
    <Screen>
      <StepHeader step={1} user={user} />
      <ScreenTitle
        title="¿Cuánto te entra al mes?"
        description="Un promedio está bien. Lo puedes cambiar después."
      />
      <IncomeForm
        key={`${user.monthlyIncome}-${user.payFrequency}-${user.payDays.join("-")}`}
        action={saveIncome}
        submitLabel={submitLabel(user)}
        initial={{
          monthlyIncome: user.monthlyIncome,
          payFrequency: user.payFrequency,
          payDays: user.payDays,
        }}
      />
    </Screen>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PlanForm } from "@/components/onboarding/forms";
import { DeleteButton, ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { getCard, openStep } from "@/lib/onboarding/data";
import { stepPath } from "@/lib/onboarding/steps";

import { deletePlan, savePlan } from "../../../actions";

export const metadata: Metadata = { title: "Tarjeta de crédito" };

type Props = Pick<PageProps<"/configuracion/tarjeta/cuotas/[id]">, "params">;

export default function PlanPage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Plan params={params} />
    </Suspense>
  );
}

async function Plan({ params }: Props) {
  const { id } = await params;
  const { db } = await openStep(4);
  const card = await getCard(db);
  // Sin tarjeta guardada no hay a qué asociar la cuota.
  if (!card) redirect(stepPath(4));

  const isNew = id === "nueva";
  const plan = card.plans.find((candidate) => candidate.id === id);
  if (!isNew && !plan) redirect(stepPath(4));

  return (
    <Screen>
      <ItemHeader
        backHref={stepPath(4)}
        title={plan ? "En la tarjeta" : "Agregar a la tarjeta"}
        action={plan && <DeleteButton action={deletePlan.bind(null, plan.id)} />}
      />
      <PlanForm
        key={plan?.id ?? "nueva"}
        action={savePlan.bind(null, plan?.id ?? null)}
        initial={
          plan && {
            principal: plan.principal,
            name: plan.name,
            kind: plan.kind,
            installmentsCount: plan.installments_count,
          }
        }
      />
    </Screen>
  );
}

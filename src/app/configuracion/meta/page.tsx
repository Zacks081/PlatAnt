import type { Metadata } from "next";
import { Suspense } from "react";

import { ListFooter } from "@/components/onboarding/list-footer";
import {
  AddLink,
  ItemList,
  Screen,
  ScreenFallback,
  ScreenTitle,
  StepHeader,
} from "@/components/onboarding/screen";
import { parseIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getGoals, openStep } from "@/lib/onboarding/data";
import { formatLongDate } from "@/lib/onboarding/labels";
import { stepPath } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Metas" };

export default function GoalsPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Goals />
    </Suspense>
  );
}

async function Goals() {
  const { user, db } = await openStep(6);
  const goals = await getGoals(db);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });

  return (
    <Screen>
      <StepHeader step={6} user={user} />
      <ScreenTitle
        title="¿Para qué quieres ahorrar?"
        description="Cada meta lleva un valor y una fecha."
      />
      <ItemList
        items={goals.map((goal) => {
          const date = parseIsoDate(goal.target_date);
          return {
            href: `${stepPath(6)}/${goal.id}`,
            name: goal.name,
            detail: date ? `Para el ${formatLongDate(date)}` : "",
            amount: money(goal.target_amount),
          };
        })}
      />
      <AddLink href={`${stepPath(6)}/nueva`}>Agregar meta</AddLink>
      <ListFooter step={6} user={user} />
    </Screen>
  );
}

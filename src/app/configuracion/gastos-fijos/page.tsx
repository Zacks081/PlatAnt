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
  TotalLine,
} from "@/components/onboarding/screen";
import { formatMoney } from "@/lib/money";
import { getFixedExpenses, openStep } from "@/lib/onboarding/data";
import { SPLIT_LABELS } from "@/lib/onboarding/labels";
import { stepPath } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Gastos fijos" };

export default function FixedExpensesPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <FixedExpenses />
    </Suspense>
  );
}

async function FixedExpenses() {
  const { user, db } = await openStep(3);
  const expenses = await getFixedExpenses(db);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <Screen>
      <StepHeader step={3} user={user} />
      <ScreenTitle title="Tus gastos fijos" description="Lo que pagas cada mes sin falta." />
      <ItemList
        items={expenses.map((expense) => ({
          href: `${stepPath(3)}/${expense.id}`,
          name: expense.name,
          detail:
            user.payFrequency === "biweekly"
              ? `Día ${expense.due_day} · ${SPLIT_LABELS[expense.split]}`
              : `Día ${expense.due_day}`,
          amount: money(expense.amount),
        }))}
      />
      <AddLink href={`${stepPath(3)}/nuevo`}>Agregar gasto fijo</AddLink>
      {expenses.length > 0 && <TotalLine label="Suman al mes" amount={money(total)} />}
      <ListFooter step={3} user={user} />
    </Screen>
  );
}

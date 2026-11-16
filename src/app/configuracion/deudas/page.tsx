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
import { formatMoney } from "@/lib/money";
import { getDebts, openStep } from "@/lib/onboarding/data";
import { stepPath } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Deudas" };

export default function DebtsPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Debts />
    </Suspense>
  );
}

async function Debts() {
  const { user, db } = await openStep(5);
  const debts = await getDebts(db);
  const money = (amount: number) => formatMoney(amount, { currency: user.currency });

  return (
    <Screen>
      <StepHeader step={5} user={user} />
      <ScreenTitle
        title="¿Tienes otras deudas?"
        description="Préstamos que no pasan por la tarjeta."
      />
      <ItemList
        items={debts.map((debt) => ({
          href: `${stepPath(5)}/${debt.id}`,
          name: debt.name,
          detail: `Cuota de ${money(debt.installment_amount)} · día ${debt.payment_day} · faltan ${debt.installments_remaining}`,
          amount: money(debt.original_amount),
        }))}
      />
      <AddLink href={`${stepPath(5)}/nueva`}>Agregar deuda</AddLink>
      <ListFooter step={5} user={user} />
    </Screen>
  );
}

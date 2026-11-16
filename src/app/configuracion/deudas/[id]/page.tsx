import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DebtForm } from "@/components/onboarding/forms";
import { DeleteButton, ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { getDebts, openStep } from "@/lib/onboarding/data";
import { stepPath } from "@/lib/onboarding/steps";

import { deleteDebt, saveDebt } from "../../actions";

export const metadata: Metadata = { title: "Deuda" };

type Props = Pick<PageProps<"/configuracion/deudas/[id]">, "params">;

export default function DebtPage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Debt params={params} />
    </Suspense>
  );
}

async function Debt({ params }: Props) {
  const { id } = await params;
  const { db } = await openStep(5);
  const debts = await getDebts(db);

  const isNew = id === "nueva";
  const debt = debts.find((candidate) => candidate.id === id);
  if (!isNew && !debt) redirect(stepPath(5));

  return (
    <Screen>
      <ItemHeader
        backHref={stepPath(5)}
        title={debt ? "Deuda" : "Nueva deuda"}
        action={debt && <DeleteButton action={deleteDebt.bind(null, debt.id)} />}
      />
      <DebtForm
        action={saveDebt.bind(null, debt?.id ?? null)}
        initial={
          debt && {
            originalAmount: debt.original_amount,
            name: debt.name,
            installmentAmount: debt.installment_amount,
            paymentDay: debt.payment_day,
            installmentsRemaining: debt.installments_remaining,
          }
        }
      />
    </Screen>
  );
}

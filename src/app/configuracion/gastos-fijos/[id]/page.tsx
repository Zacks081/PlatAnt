import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FixedExpenseForm } from "@/components/onboarding/forms";
import { DeleteButton, ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { getCategories, getFixedExpenses, openStep } from "@/lib/onboarding/data";
import { stepPath } from "@/lib/onboarding/steps";

import { deleteFixedExpense, saveFixedExpense } from "../../actions";

export const metadata: Metadata = { title: "Gasto fijo" };

type Props = Pick<PageProps<"/configuracion/gastos-fijos/[id]">, "params">;

export default function FixedExpensePage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <FixedExpense params={params} />
    </Suspense>
  );
}

async function FixedExpense({ params }: Props) {
  const { id } = await params;
  const { user, db } = await openStep(3);
  const [categories, expenses] = await Promise.all([
    getCategories(db, "expense"),
    getFixedExpenses(db),
  ]);

  const isNew = id === "nuevo";
  const expense = expenses.find((candidate) => candidate.id === id);
  if (!isNew && !expense) redirect(stepPath(3));

  return (
    <Screen>
      <ItemHeader
        backHref={stepPath(3)}
        title={expense ? "Gasto fijo" : "Nuevo gasto fijo"}
        action={expense && <DeleteButton action={deleteFixedExpense.bind(null, expense.id)} />}
      />
      <FixedExpenseForm
        key={expense?.id ?? "nuevo"}
        action={saveFixedExpense.bind(null, expense?.id ?? null)}
        categories={categories.map((category) => ({ value: category.id, label: category.name }))}
        otherCategoryId={categories.find((category) => category.name === "Otros")?.id ?? null}
        askSplit={user.payFrequency === "biweekly"}
        initial={
          expense && {
            amount: expense.amount,
            name: expense.name,
            categoryId: expense.category_id,
            dueDay: expense.due_day,
            split: expense.split,
          }
        }
      />
    </Screen>
  );
}

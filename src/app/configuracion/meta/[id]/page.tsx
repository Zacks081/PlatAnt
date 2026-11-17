import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { GoalForm } from "@/components/onboarding/forms";
import { DeleteButton, ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { todayInTimeZone } from "@/lib/dates";
import { getGoals, openStep } from "@/lib/onboarding/data";
import { stepPath } from "@/lib/onboarding/steps";

import { deleteGoal, saveGoal } from "../../actions";

export const metadata: Metadata = { title: "Meta" };

type Props = Pick<PageProps<"/configuracion/meta/[id]">, "params">;

export default function GoalPage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Goal params={params} />
    </Suspense>
  );
}

async function Goal({ params }: Props) {
  const { id } = await params;
  const { user, db } = await openStep(6);
  const goals = await getGoals(db);

  const isNew = id === "nueva";
  const goal = goals.find((candidate) => candidate.id === id);
  if (!isNew && !goal) redirect(stepPath(6));

  return (
    <Screen>
      <ItemHeader
        backHref={stepPath(6)}
        title={goal ? "Meta" : "Nueva meta"}
        action={goal && <DeleteButton action={deleteGoal.bind(null, goal.id)} />}
      />
      <GoalForm
        key={goal?.id ?? "nueva"}
        action={saveGoal.bind(null, goal?.id ?? null)}
        today={todayInTimeZone(user.timeZone)}
        payFrequency={user.payFrequency}
        initial={
          goal && {
            targetAmount: goal.target_amount,
            name: goal.name,
            targetDate: goal.target_date,
          }
        }
      />
    </Screen>
  );
}

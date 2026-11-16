import type { Metadata } from "next";
import { Suspense } from "react";

import { GoalForm } from "@/components/onboarding/forms";
import {
  DeleteButton,
  Screen,
  ScreenFallback,
  ScreenTitle,
  StepHeader,
} from "@/components/onboarding/screen";
import { formatYearMonth, todayInTimeZone } from "@/lib/dates";
import { getGoal, openStep, yearMonthOfDate } from "@/lib/onboarding/data";
import { monthOptions } from "@/lib/onboarding/labels";
import { submitLabel } from "@/lib/onboarding/steps";

import { deleteGoal, saveGoal } from "../actions";

export const metadata: Metadata = { title: "Meta" };

export default function GoalPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Goal />
    </Suspense>
  );
}

async function Goal() {
  const { user, db } = await openStep(6);
  const goal = await getGoal(db);
  const today = todayInTimeZone(user.timeZone);

  return (
    <Screen>
      <StepHeader step={6} user={user} />
      <div className="flex items-start justify-between gap-3">
        <ScreenTitle title="¿Para qué quieres ahorrar?" description="Una meta con valor y fecha." />
        {goal && <DeleteButton action={deleteGoal} />}
      </div>
      <GoalForm
        action={saveGoal}
        submitLabel={submitLabel(user)}
        monthOptions={monthOptions(today)}
        today={{ year: today.year, month: today.month }}
        payFrequency={user.payFrequency}
        initial={
          goal
            ? {
                targetAmount: goal.target_amount,
                name: goal.name,
                targetMonth: formatYearMonth(yearMonthOfDate(goal.target_date)),
              }
            : undefined
        }
      />
    </Screen>
  );
}

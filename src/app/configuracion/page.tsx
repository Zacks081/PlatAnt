import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ScreenFallback } from "@/components/onboarding/screen";
import { getCurrentUser } from "@/lib/auth/session";
import { currentPath, SETTINGS_PATH } from "@/lib/onboarding/steps";

/** Entrada al recorrido: lleva al paso que le toca a cada quien. */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <GoToCurrentStep />
    </Suspense>
  );
}

async function GoToCurrentStep(): Promise<never> {
  const user = await getCurrentUser();
  redirect(user.onboardingCompleted ? SETTINGS_PATH : currentPath(user));
}

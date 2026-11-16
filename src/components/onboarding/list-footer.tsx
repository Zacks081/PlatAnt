import Link from "next/link";

import { completeStep } from "@/app/configuracion/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/session";
import { isEditing, pathAfterStep, type StepNumber } from "@/lib/onboarding/steps";

/**
 * Botón de abajo en los pasos que son una lista (gastos fijos, deudas).
 * En el recorrido es «Continuar» y deja el paso hecho; al editar es «Listo» y solo vuelve.
 */
export function ListFooter({ step, user }: { step: StepNumber; user: CurrentUser }) {
  return (
    <div className="mt-auto pt-4">
      {isEditing(user) ? (
        <Link
          href={pathAfterStep(step, user)}
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          Listo
        </Link>
      ) : (
        <form action={completeStep.bind(null, step)}>
          <Button type="submit" size="lg" className="w-full">
            Continuar
          </Button>
        </form>
      )}
    </div>
  );
}

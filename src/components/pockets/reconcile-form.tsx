"use client";

import { useActionState, useState } from "react";

import { HeroMoney } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { emptyFormState, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { parseMoneyInput } from "@/lib/money-input";
import { reconciliation, reconciliationLabel } from "@/lib/pockets/pockets";
import { cn } from "@/lib/utils";

type ReconcileFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** Lo que calcula la app para el bolsillo. */
  expected: number;
  currency: string;
};

/**
 * Cuadre de saldo: se escribe cuánto hay de verdad y, antes de confirmar, se ve la diferencia
 * y cómo se va a registrar.
 */
export function ReconcileForm({ action, expected, currency }: ReconcileFormProps) {
  const [state, formAction, isPending] = useActionState(action, emptyFormState);
  const [actual, setActual] = useState<number | null>(() =>
    parseMoneyInput(state.values?.actual ?? ""),
  );
  const money = (amount: number) => formatMoney(amount, { currency });
  const result = actual === null ? null : reconciliation(expected, actual);

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-center text-muted-foreground">¿Cuánto tienes de verdad?</p>
        <HeroMoney
          name="actual"
          label="Cuánto tienes de verdad"
          tone="neutral"
          defaultValue={state.values?.actual}
          error={state.errors?.actual}
          onValueChange={setActual}
          autoFocus
        />
      </div>
      {/* El saldo que se ve aquí es contra el que se cuadra: si cambia, la base de datos avisa. */}
      <input type="hidden" name="expected" value={expected} />

      <dl className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
        <div className="flex min-h-14 items-center justify-between gap-3">
          <dt className="text-muted-foreground">Según la app</dt>
          <dd className={cn("font-semibold tabular-nums", expected < 0 && "text-gasto")}>
            {money(expected)}
          </dd>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <dt className="text-muted-foreground">Diferencia</dt>
          <dd
            className={cn(
              "font-display text-lg font-bold tabular-nums",
              result?.kind === "expense" && "text-gasto",
              result?.kind === "income" && "text-libre",
              (!result || result.kind === "none") && "text-muted-foreground",
            )}
          >
            {!result
              ? "—"
              : result.kind === "none"
                ? money(0)
                : `${result.kind === "expense" ? "−" : "+"}${money(result.amount)}`}
          </dd>
        </div>
      </dl>

      <p aria-live="polite" className="px-1 text-[13px] text-muted-foreground">
        {!result
          ? "Mira tu app del banco o cuenta tu billetera y escribe cuánto hay."
          : result.kind === "none"
            ? "Tu saldo ya cuadra: no se registra nada."
            : `Se registra hoy un «${reconciliationLabel(result.kind).toLowerCase()}» de ${money(result.amount)}, y el saldo queda en ${money(actual ?? 0)}.`}
      </p>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
          {state.message}
        </p>
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? "Cuadrando…" : "Cuadrar"}
        </Button>
      </div>
    </form>
  );
}

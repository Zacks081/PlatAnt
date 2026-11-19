"use client";

import Link from "next/link";
import { useActionState } from "react";

import { DateRow, FieldCard, HeroMoney } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import type { PayFormState } from "@/app/(app)/quincena/actions";
import type { CalendarDate } from "@/lib/dates";

type PaydayFormProps = {
  action: (previous: PayFormState, formData: FormData) => Promise<PayFormState>;
  today: CalendarDate;
  minDate: CalendarDate;
  initial: { amount?: number; date: string };
  /** Debajo de los campos: qué pasa al guardar. */
  note: string;
  /** Al registrar uno nuevo, el teclado numérico se abre solo. */
  autoFocus: boolean;
};

/**
 * «Me pagaron»: cuánto llegó y cuándo. Si parece un pago que ya se registró, antes de abrir
 * otra quincena pregunta si de verdad es el siguiente.
 */
export function PaydayForm({ action, today, minDate, initial, note, autoFocus }: PaydayFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const value = (name: string, saved: string | number | undefined = "") =>
    state.values?.[name] ?? String(saved);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-center text-muted-foreground">¿Cuánto te pagaron?</p>
        <HeroMoney
          name="amount"
          label="Cuánto te pagaron"
          tone="libre"
          defaultValue={value("amount", initial.amount)}
          error={errors.amount}
          autoFocus={autoFocus}
        />
      </div>
      <FieldCard>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <span className="text-muted-foreground">Entra a</span>
          <span className="font-semibold">Cuenta</span>
        </div>
        <DateRow
          name="date"
          label="Fecha"
          min={minDate}
          max={today}
          defaultValue={value("date", initial.date)}
          error={errors.date}
        />
      </FieldCard>
      <p className="px-1 text-[13px] text-muted-foreground">{note}</p>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
          {state.message}
        </p>
        {state.confirm ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-[24px] border border-estado-regular-borde bg-estado-regular-fondo p-5"
          >
            <p className="text-sm text-estado-regular-texto">
              <span className="font-semibold text-estado-regular">¿Otro pago?</span>{" "}
              {state.confirm.message}
            </p>
            <Button
              type="submit"
              name="confirm"
              value={state.confirm.key}
              size="lg"
              disabled={isPending}
              className="w-full"
            >
              {isPending ? "Guardando…" : state.confirm.label}
            </Button>
            <p className="text-[13px] text-estado-regular-texto">
              Si es plata extra, como una prima o un bono,{" "}
              <Link
                href="/registrar/ingreso"
                className="font-semibold text-foreground underline underline-offset-2"
              >
                regístrala como ingreso
              </Link>
              .
            </p>
          </div>
        ) : (
          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
        )}
      </div>
    </form>
  );
}

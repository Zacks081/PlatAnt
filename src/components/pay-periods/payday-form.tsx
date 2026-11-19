"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { DateRow, FieldCard, HeroMoney, SelectRow } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import type { PayFormState } from "@/app/(app)/quincena/actions";
import { parseIsoDate, type CalendarDate } from "@/lib/dates";
import { POCKET_LABELS } from "@/lib/movements/format";
import { instanceKey, payOptions, type PayInstance } from "@/lib/pay-periods/schedule";
import { payOptionLabel } from "@/lib/pay-periods/summary";

/** El pago llega a la cuenta o en efectivo. */
const POCKETS = (["account", "cash"] as const).map((kind) => ({
  value: kind,
  label: POCKET_LABELS[kind],
}));

type PaydayFormProps = {
  action: (previous: PayFormState, formData: FormData) => Promise<PayFormState>;
  today: CalendarDate;
  minDate: CalendarDate;
  initial: { amount?: number; date: string; pocket: "account" | "cash" };
  /** Debajo de los campos: qué pasa al guardar. */
  note: string;
  /** Al registrar uno nuevo, el teclado numérico se abre solo. */
  autoFocus: boolean;
  /**
   * De qué quincena es el pago. Al registrar uno nuevo se elige (`choose`, con el último pago
   * registrado); al corregirlo solo se muestra (`fixed`), porque no cambia.
   */
  pay:
    { choose: { last: PayInstance | null; payDays: number[] } } | { fixed: string; label: string };
};

/**
 * «Me pagaron»: cuánto llegó, a dónde y cuándo. Si parece un pago que ya se registró, antes de abrir
 * otra quincena pregunta si de verdad es el siguiente.
 */
export function PaydayForm({
  action,
  today,
  minDate,
  initial,
  note,
  autoFocus,
  pay,
}: PaydayFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const value = (name: string, saved: string | number | undefined = "") =>
    state.values?.[name] ?? String(saved);
  const errors = state.errors ?? {};
  // La quincena que se propone depende de la fecha: se recalcula al cambiarla.
  const [date, setDate] = useState(value("date", initial.date));

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
        <SelectRow
          name="pocket"
          label="Entra a"
          options={POCKETS}
          defaultValue={value("pocket", initial.pocket)}
          error={errors.pocket}
        />
        <DateRow
          name="date"
          label="Fecha"
          min={minDate}
          max={today}
          defaultValue={value("date", initial.date)}
          error={errors.date}
          onValueChange={setDate}
        />
        {"choose" in pay ? (
          <PayInstanceRow
            date={date}
            last={pay.choose.last}
            payDays={pay.choose.payDays}
            saved={value("instance")}
            error={errors.instance}
          />
        ) : (
          <div className="flex min-h-14 items-center justify-between gap-3">
            <span className="text-muted-foreground">{pay.label}</span>
            <span className="font-semibold">{pay.fixed}</span>
          </div>
        )}
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
        ) : state.prior ? (
          // Solo en el primer pago: lo que les tocaba a pagos de antes de la app, ¿ya estaba apartado?
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-[24px] border border-estado-regular-borde bg-estado-regular-fondo p-5"
          >
            <p className="text-sm text-estado-regular-texto">
              <span className="font-semibold text-estado-regular">Tu primer pago.</span>{" "}
              {state.prior.message}
            </p>
            <Button
              type="submit"
              name="prior"
              value="yes"
              size="lg"
              disabled={isPending}
              className="w-full"
            >
              Sí, ya la tengo apartada
            </Button>
            <Button
              type="submit"
              name="prior"
              value="no"
              variant="outline"
              size="lg"
              disabled={isPending}
              className="w-full"
            >
              No, apártala de este pago
            </Button>
            <p className="text-[13px] text-estado-regular-texto">
              Si ya la tienes, sigue apartada pero no sale de este pago.
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

/**
 * La fila «Quincena» (o «Mes»): viene con la que propone la app para la fecha elegida y se
 * puede cambiar por la anterior o la siguiente. Si se cambia la fecha, se vuelve a proponer,
 * salvo que lo elegido siga teniendo sentido.
 */
function PayInstanceRow({
  date,
  last,
  payDays,
  saved,
  error,
}: {
  date: string;
  last: PayInstance | null;
  payDays: number[];
  saved: string;
  error?: string;
}) {
  const [chosen, setChosen] = useState(saved);
  const parsed = parseIsoDate(date);
  if (!parsed) return null;

  const { suggested, options } = payOptions(parsed, last, payDays);
  const choices = options.map((instance) => ({
    value: String(instanceKey(instance)),
    label: payOptionLabel(instance, payDays),
  }));
  const selected = choices.some((choice) => choice.value === chosen)
    ? chosen
    : String(instanceKey(suggested));

  return (
    <SelectRow
      // La lista cambia con la fecha: así la fila arranca de nuevo con lo que toca.
      key={`${choices.map((choice) => choice.value).join()}:${selected}`}
      name="instance"
      label={payDays.length > 1 ? "Quincena" : "Mes"}
      options={choices}
      defaultValue={selected}
      onValueChange={setChosen}
      error={error}
    />
  );
}

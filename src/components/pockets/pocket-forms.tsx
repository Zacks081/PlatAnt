"use client";

import { useActionState, useState } from "react";

import { DateRow, FieldCard, HeroMoney } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import type { PocketFormState } from "@/app/bolsillos/actions";
import type { CalendarDate } from "@/lib/dates";

type Action = (previous: PocketFormState, formData: FormData) => Promise<PocketFormState>;

type CommonProps = {
  action: Action;
  today: CalendarDate;
  minDate: CalendarDate;
  initial: { amount?: number; date: string };
  /** El nombre del bolsillo (el del gasto fijo). */
  pocketName: string;
};

function StaticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-semibold">{value}</span>
    </div>
  );
}

/** Apartar (de la cuenta al bolsillo) o sacar (del bolsillo a la cuenta). */
export function PocketMoveForm({
  action,
  today,
  minDate,
  initial,
  pocketName,
  into,
}: CommonProps & { into: boolean }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const value = (name: string, saved: string | number | undefined = "") =>
    state.values?.[name] ?? String(saved);
  const errors = state.errors ?? {};
  const pocket = `Bolsillo ${pocketName}`;

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-center text-muted-foreground">
          {into ? "¿Cuánto apartas?" : "¿Cuánto sacas?"}
        </p>
        <HeroMoney
          name="amount"
          label={into ? "Cuánto apartas" : "Cuánto sacas"}
          tone="neutral"
          defaultValue={value("amount", initial.amount)}
          error={errors.amount}
          autoFocus
        />
      </div>
      <FieldCard>
        <StaticRow label="Sale de" value={into ? "Cuenta" : pocket} />
        <StaticRow label="Entra a" value={into ? pocket : "Cuenta"} />
        <DateRow
          name="date"
          label="Fecha"
          min={minDate}
          max={today}
          defaultValue={value("date", initial.date)}
          error={errors.date}
        />
      </FieldCard>
      <p className="px-1 text-[13px] text-muted-foreground">
        {into
          ? "Pasa de tu cuenta al bolsillo. Haz lo mismo en tu banco para que cuadre."
          : "Vuelve del bolsillo a tu cuenta. Haz lo mismo en tu banco para que cuadre."}
      </p>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
          {state.message}
        </p>
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? "Guardando…" : into ? "Apartar" : "Sacar"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Pagar el gasto desde su bolsillo. El valor viene lleno con el del gasto fijo y se puede
 * cambiar (los servicios cambian cada mes). Si el bolsillo no alcanza, pregunta si lo que
 * falta sale de la cuenta.
 */
export function PocketPayForm({
  action,
  today,
  minDate,
  initial,
  pocketName,
  recordedAs,
}: CommonProps & { recordedAs: string }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const value = (name: string, saved: string | number | undefined = "") =>
    state.values?.[name] ?? String(saved);
  const errors = state.errors ?? {};
  // «Cancelar» esconde el aviso hasta el siguiente intento, para cambiar el valor si hace falta.
  const [dismissed, setDismissed] = useState<PocketFormState | null>(null);
  const shortfall = dismissed === state ? undefined : state.shortfall;

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-center text-muted-foreground">¿Cuánto pagaste?</p>
        <HeroMoney
          name="amount"
          label="Cuánto pagaste"
          tone="gasto"
          defaultValue={value("amount", initial.amount)}
          error={errors.amount}
          autoFocus={false}
        />
      </div>
      <FieldCard>
        <StaticRow label="Sale de" value={`Bolsillo ${pocketName}`} />
        <DateRow
          name="date"
          label="Fecha"
          min={minDate}
          max={today}
          defaultValue={value("date", initial.date)}
          error={errors.date}
        />
        <StaticRow label="Se registra como" value={recordedAs} />
      </FieldCard>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
          {state.message}
        </p>
        {shortfall ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-[24px] border border-estado-regular-borde bg-estado-regular-fondo p-5"
          >
            <p className="text-sm text-estado-regular-texto">
              <span className="font-semibold text-estado-regular">No alcanza.</span>{" "}
              {shortfall.message}
            </p>
            <Button
              type="submit"
              name="cover"
              value="yes"
              size="lg"
              disabled={isPending}
              className="w-full"
            >
              {isPending ? "Pagando…" : shortfall.label}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => {
                setDismissed(state);
                document.querySelector<HTMLInputElement>('input[name="amount"]')?.focus();
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? "Pagando…" : "Pagar"}
          </Button>
        )}
      </div>
    </form>
  );
}

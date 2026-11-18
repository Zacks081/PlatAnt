"use client";

import { useActionState, useState } from "react";

import {
  DateRow,
  FieldCard,
  HeroMoney,
  SelectRow,
  TextRow,
  type Option,
} from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import type { CalendarDate } from "@/lib/dates";
import { emptyFormState, type FormState } from "@/lib/forms";

type MovementFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  kind: "expense" | "income";
  categories: Option[];
  /** La categoría «Otros»: al elegirla se puede escribir una categoría nueva. */
  otherCategoryId: string | null;
  pockets: Option[];
  today: CalendarDate;
  /** Primera fecha que se puede elegir. */
  minDate: CalendarDate;
  initial: {
    amount?: number;
    categoryId?: string;
    pocketId?: string;
    date: string;
    description?: string;
  };
  /** Al registrar uno nuevo, el teclado numérico se abre solo. */
  autoFocus: boolean;
};

/** Formulario de un gasto o un ingreso: el valor arriba y los demás datos en una tarjeta. */
export function MovementForm({
  action,
  kind,
  categories,
  otherCategoryId,
  pockets,
  today,
  minDate,
  initial,
  autoFocus,
}: MovementFormProps) {
  const [state, formAction, isPending] = useActionState(action, emptyFormState);
  const value = (name: string, saved: string | number | undefined = "") =>
    state.values?.[name] ?? String(saved);
  const errors = state.errors ?? {};
  const [categoryId, setCategoryId] = useState(value("categoryId", initial.categoryId));
  const isExpense = kind === "expense";

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-5">
      <HeroMoney
        name="amount"
        label={isExpense ? "Valor del gasto" : "Valor del ingreso"}
        tone={isExpense ? "gasto" : "libre"}
        defaultValue={value("amount", initial.amount)}
        error={errors.amount}
        autoFocus={autoFocus}
      />
      <FieldCard>
        <SelectRow
          name="categoryId"
          label="Categoría"
          options={categories}
          defaultValue={categoryId}
          onValueChange={setCategoryId}
          error={errors.categoryId}
        />
        {otherCategoryId !== null && categoryId === otherCategoryId ? (
          <TextRow
            name="newCategory"
            label="Nombre de la categoría"
            placeholder="Opcional"
            maxLength={40}
            defaultValue={value("newCategory")}
            error={errors.newCategory}
          />
        ) : (
          <input type="hidden" name="newCategory" value="" />
        )}
        <SelectRow
          name="pocketId"
          label={isExpense ? "Sale de" : "Entra a"}
          options={pockets}
          defaultValue={value("pocketId", initial.pocketId)}
          error={errors.pocketId}
        />
        <DateRow
          name="date"
          label="Fecha"
          min={minDate}
          max={today}
          defaultValue={value("date", initial.date)}
          error={errors.date}
        />
        <TextRow
          name="description"
          label="Descripción"
          placeholder="Opcional"
          maxLength={140}
          defaultValue={value("description", initial.description)}
          error={errors.description}
        />
      </FieldCard>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
          {state.message}
        </p>
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

type TransferFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** Retiro: de la cuenta al efectivo. Consignación: del efectivo a la cuenta. */
  direction: "withdrawal" | "deposit";
  today: CalendarDate;
  minDate: CalendarDate;
  initial: { amount?: number; date: string; description?: string };
  autoFocus: boolean;
};

/** Retiro o consignación: plata que cambia de bolsillo. No es gasto ni ingreso. */
export function TransferForm({
  action,
  direction,
  today,
  minDate,
  initial,
  autoFocus,
}: TransferFormProps) {
  const [state, formAction, isPending] = useActionState(action, emptyFormState);
  const value = (name: string, saved: string | number | undefined = "") =>
    state.values?.[name] ?? String(saved);
  const errors = state.errors ?? {};
  const [from, to] = direction === "withdrawal" ? ["Cuenta", "Efectivo"] : ["Efectivo", "Cuenta"];

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-5">
      <HeroMoney
        name="amount"
        label={direction === "withdrawal" ? "Valor del retiro" : "Valor de la consignación"}
        tone="neutral"
        defaultValue={value("amount", initial.amount)}
        error={errors.amount}
        autoFocus={autoFocus}
      />
      <FieldCard>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <span className="text-muted-foreground">Sale de</span>
          <span className="font-semibold">{from}</span>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <span className="text-muted-foreground">Entra a</span>
          <span className="font-semibold">{to}</span>
        </div>
        <DateRow
          name="date"
          label="Fecha"
          min={minDate}
          max={today}
          defaultValue={value("date", initial.date)}
          error={errors.date}
        />
        <TextRow
          name="description"
          label="Descripción"
          placeholder="Opcional"
          maxLength={140}
          defaultValue={value("description", initial.description)}
          error={errors.description}
        />
      </FieldCard>
      <p className="px-1 text-[13px] text-muted-foreground">
        {direction === "withdrawal"
          ? "Un retiro no es un gasto: la plata solo pasa de tu cuenta a tu billetera."
          : "Una consignación no es un ingreso: la plata solo pasa de tu billetera a tu cuenta."}
      </p>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
          {state.message}
        </p>
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";

import { FieldCard, SegmentedRow, TextRow } from "@/components/forms/fields";
import { CATEGORY_ICONS, ICON_KEYS } from "@/components/movements/category-icon";
import { Button } from "@/components/ui/button";
import { emptyFormState, type FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

type CategoryFormProps = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  kind: "expense" | "income";
  /** «Otros» no se puede renombrar: la app lo usa para crear categorías nuevas. */
  nameLocked: boolean;
  initial?: { name: string; icon: string; isAnt: boolean };
};

/** Crear o editar una categoría: nombre, ícono y, si es de gasto, si es «gasto hormiga». */
export function CategoryForm({ action, kind, nameLocked, initial }: CategoryFormProps) {
  const [state, formAction, isPending] = useActionState(action, emptyFormState);
  const errors = state.errors ?? {};
  const [icon, setIcon] = useState(state.values?.icon ?? initial?.icon ?? "otros");
  const [isAnt, setIsAnt] = useState(state.values?.isAnt ?? String(initial?.isAnt ?? false));

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-5">
      <FieldCard>
        <TextRow
          name="name"
          label="Nombre"
          placeholder="Mascotas, regalos…"
          maxLength={40}
          readOnly={nameLocked}
          defaultValue={state.values?.name ?? initial?.name}
          error={errors.name}
        />
        {kind === "expense" ? (
          <SegmentedRow
            name="isAnt"
            label="Gasto hormiga"
            value={isAnt}
            onChange={setIsAnt}
            options={[
              { value: "false", label: "No" },
              { value: "true", label: "Sí" },
            ]}
          />
        ) : (
          <input type="hidden" name="isAnt" value="false" />
        )}
      </FieldCard>
      {kind === "expense" && (
        <p className="px-1 text-[13px] text-muted-foreground">
          Los gastos hormiga son los pequeños que se repiten sin que lo notes: un café, un snack, un
          domicilio. Más adelante la app te mostrará cuánto suman.
        </p>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 id="icon-label" className="px-1 font-display text-lg font-semibold">
          Ícono
        </h2>
        <input type="hidden" name="icon" value={icon} />
        <div
          role="radiogroup"
          aria-labelledby="icon-label"
          className="grid grid-cols-6 gap-2 rounded-[24px] bg-card p-3"
        >
          {ICON_KEYS.map((key) => {
            const { icon: Icon, label } = CATEGORY_ICONS[key];
            const isSelected = key === icon;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={label}
                data-icon={key}
                onClick={() => setIcon(key)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-secondary",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
              </button>
            );
          })}
        </div>
        {errors.icon && <p className="px-1 text-[13px] text-gasto">{errors.icon}</p>}
      </section>

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

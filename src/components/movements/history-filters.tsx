"use client";

import { Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { DateRow } from "@/components/forms/fields";
import { Sheet } from "@/components/forms/sheet";
import { Button } from "@/components/ui/button";
import type { CalendarDate } from "@/lib/dates";
import { MAX_CUSTOM_DAYS } from "@/lib/movements/periods";
import { cn } from "@/lib/utils";

type FilterOption = { value: string; label: string };

/** Cambia parámetros de la dirección (?periodo=…) sin recargar ni subir al inicio de la página. */
function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    // Al cambiar un filtro se vuelve a la primera página.
    params.delete("pagina");
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}

type FilterProps = {
  /** Nombre del parámetro en la dirección. */
  param: string;
  title: string;
  /** Lo que se muestra cuando no hay nada elegido. */
  allLabel: string;
  options: FilterOption[];
  value: string | null;
  /** Otros parámetros que se borran al cambiar este (la categoría, al cambiar el tipo). */
  clears?: string[];
};

/** Un filtro del historial: una pastilla que abre una hoja con las opciones. */
function Filter({ param, title, allLabel, options, value, clears = [] }: FilterProps) {
  const update = useQueryUpdater();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const choose = (next: string | null) => {
    update({ [param]: next, ...Object.fromEntries(clears.map((key) => [key, null])) });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        data-filter={param}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-10 shrink-0 items-center gap-1 rounded-full pr-3 pl-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          selected ? "bg-foreground text-background" : "bg-secondary text-foreground",
        )}
      >
        {selected?.label ?? allLabel}
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={title}>
        <div role="listbox" aria-label={title} className="flex flex-col">
          {[{ value: "", label: allLabel }, ...options].map((option) => {
            const isSelected = (value ?? "") === option.value;
            return (
              <button
                key={option.value || "todos"}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-value={option.value}
                onClick={() => choose(option.value || null)}
                className={cn(
                  "flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isSelected && "font-semibold text-libre",
                )}
              >
                {option.label}
                {isSelected && <Check aria-hidden="true" className="size-5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

type CustomRangeProps = {
  from: string | null;
  to: string | null;
  today: CalendarDate;
  minDate: CalendarDate;
  error?: string;
};

/** «Desde» y «Hasta» para las fechas personalizadas, con un máximo de 30 días. */
function CustomRange({ from, to, today, minDate, error }: CustomRangeProps) {
  const update = useQueryUpdater();
  const [start, setStart] = useState(from ?? "");
  const [end, setEnd] = useState(to ?? "");

  return (
    <section className="flex flex-col gap-3 rounded-[24px] bg-card px-5 pt-1 pb-4">
      <div className="flex flex-col divide-y divide-border">
        <DateRow
          name="desde"
          label="Desde"
          min={minDate}
          max={today}
          defaultValue={start}
          onValueChange={setStart}
        />
        <DateRow
          name="hasta"
          label="Hasta"
          min={minDate}
          max={today}
          defaultValue={end}
          onValueChange={setEnd}
        />
      </div>
      <p className={cn("text-[13px]", error ? "text-gasto" : "text-muted-foreground")}>
        {error ?? `Puedes ver hasta ${MAX_CUSTOM_DAYS} días a la vez.`}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={!start || !end}
        onClick={() => update({ desde: start, hasta: end })}
        className="w-full"
      >
        Ver estas fechas
      </Button>
    </section>
  );
}

type HistoryFiltersProps = {
  period: string | null;
  periods: FilterOption[];
  type: string | null;
  types: FilterOption[];
  categoryId: string | null;
  /** Categorías del tipo elegido; `null` si el tipo no tiene categorías. */
  categories: FilterOption[] | null;
  pocketId: string | null;
  pockets: FilterOption[];
  custom: { from: string | null; to: string | null; error?: string };
  today: CalendarDate;
  minDate: CalendarDate;
};

/** Filtros del historial: fecha, tipo de movimiento, categoría y bolsillo. Se combinan. */
export function HistoryFilters(props: HistoryFiltersProps) {
  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Filter
          param="periodo"
          title="Fecha"
          allLabel="Últimos 3 meses"
          value={props.period}
          options={props.periods}
          clears={["desde", "hasta"]}
        />
        <Filter
          param="tipo"
          title="Tipo de movimiento"
          allLabel="Cualquier tipo"
          value={props.type}
          options={props.types}
          clears={["categoria"]}
        />
        {props.categories && (
          <Filter
            param="categoria"
            title="Categoría"
            allLabel="Todas las categorías"
            value={props.categoryId}
            options={props.categories}
          />
        )}
        <Filter
          param="bolsillo"
          title="Bolsillo"
          allLabel="Todos los bolsillos"
          value={props.pocketId}
          options={props.pockets}
        />
      </div>
      {props.period === "personalizado" && (
        <CustomRange
          key={`${props.custom.from}-${props.custom.to}`}
          from={props.custom.from}
          to={props.custom.to}
          today={props.today}
          minDate={props.minDate}
          error={props.custom.error}
        />
      )}
    </>
  );
}

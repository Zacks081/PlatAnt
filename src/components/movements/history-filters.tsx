"use client";

import { Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Sheet } from "@/components/forms/sheet";
import { cn } from "@/lib/utils";

type FilterOption = { value: string; label: string };

type FilterProps = {
  /** Nombre del parámetro en la dirección (?periodo=…). */
  param: string;
  title: string;
  /** Lo que se muestra cuando no hay nada elegido. */
  allLabel: string;
  options: FilterOption[];
  value: string | null;
};

/** Un filtro del historial: una pastilla que abre una hoja con las opciones. */
function Filter({ param, title, allLabel, options, value }: FilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const choose = (next: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set(param, next);
    else params.delete(param);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setOpen(false);
  };

  const all = [{ value: "", label: allLabel }, ...options];

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
          {all.map((option) => {
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

type HistoryFiltersProps = {
  period: string;
  categoryId: string | null;
  pocketId: string | null;
  categories: FilterOption[];
  pockets: FilterOption[];
};

/** Filtros del historial por fecha, categoría y bolsillo. Se combinan entre sí. */
export function HistoryFilters({
  period,
  categoryId,
  pocketId,
  categories,
  pockets,
}: HistoryFiltersProps) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <Filter
        param="periodo"
        title="Fecha"
        allLabel="Todas las fechas"
        value={period === "todo" ? null : period}
        options={[
          { value: "este-mes", label: "Este mes" },
          { value: "mes-pasado", label: "Mes pasado" },
          { value: "3-meses", label: "Últimos 3 meses" },
        ]}
      />
      <Filter
        param="categoria"
        title="Categoría"
        allLabel="Todas las categorías"
        value={categoryId}
        options={categories}
      />
      <Filter
        param="bolsillo"
        title="Bolsillo"
        allLabel="Todos los bolsillos"
        value={pocketId}
        options={pockets}
      />
    </div>
  );
}

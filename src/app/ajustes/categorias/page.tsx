import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryIcon } from "@/components/movements/category-icon";
import { AddLink, BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { getCategories, openApp } from "@/lib/movements/data";
import { SETTINGS_PATH } from "@/lib/onboarding/steps";

export const metadata: Metadata = { title: "Categorías" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Categories />
    </Suspense>
  );
}

type Category = Awaited<ReturnType<typeof getCategories>>[number];

function CategoryGroup({ title, categories }: { title: string; categories: Category[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 font-display text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-4">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/ajustes/categorias/${category.id}`}
              className="flex min-h-14 items-center gap-3 rounded-lg py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <CategoryIcon
                icon={category.icon}
                className={category.archived_at ? "opacity-50" : undefined}
              />
              <span
                className={`min-w-0 flex-1 truncate ${category.archived_at ? "text-muted-foreground" : ""}`}
              >
                {category.name}
              </span>
              {category.is_ant && (
                <span className="rounded-full bg-estado-regular-fondo px-2.5 py-1 text-xs font-semibold text-estado-regular">
                  Hormiga
                </span>
              )}
              {category.archived_at && (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  Oculta
                </span>
              )}
              <ChevronRight aria-hidden="true" className="size-[18px] text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Categories() {
  const { db } = await openApp();
  const [expense, income] = await Promise.all([
    getCategories(db, "expense", { includeHidden: true }),
    getCategories(db, "income", { includeHidden: true }),
  ]);
  // Las ocultas van al final de cada grupo.
  const order = (list: Category[]) => [
    ...list.filter((category) => !category.archived_at),
    ...list.filter((category) => category.archived_at),
  ];

  return (
    <Screen>
      <header className="flex min-h-11 items-center gap-3">
        <BackLink href={SETTINGS_PATH} label="Volver a Ajustes" />
        <h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">Categorías</h1>
      </header>
      <CategoryGroup title="Gastos" categories={order(expense)} />
      <AddLink href="/ajustes/categorias/nuevo-gasto">Nueva categoría de gasto</AddLink>
      <CategoryGroup title="Ingresos" categories={order(income)} />
      <AddLink href="/ajustes/categorias/nuevo-ingreso">Nueva categoría de ingreso</AddLink>
    </Screen>
  );
}

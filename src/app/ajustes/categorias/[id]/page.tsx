import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { CategoryForm } from "@/components/movements/category-form";
import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { Button } from "@/components/ui/button";
import { openApp } from "@/lib/movements/data";
import { PROTECTED_CATEGORIES } from "@/lib/movements/validation";

import { saveCategory, setCategoryHidden } from "../../../movimientos/actions";

export const metadata: Metadata = { title: "Categoría" };

const BACK = "/ajustes/categorias";
const NEW = { "nuevo-gasto": "expense", "nuevo-ingreso": "income" } as const;

type Props = Pick<PageProps<"/ajustes/categorias/[id]">, "params">;

export default function CategoryPage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Category params={params} />
    </Suspense>
  );
}

async function Category({ params }: Props) {
  const { id } = await params;
  const newKind = NEW[id as keyof typeof NEW];

  if (newKind) {
    await openApp();
    return (
      <Screen>
        <ItemHeader
          backHref={BACK}
          title={newKind === "expense" ? "Nueva categoría de gasto" : "Nueva categoría de ingreso"}
        />
        <CategoryForm
          action={saveCategory.bind(null, null, newKind)}
          kind={newKind}
          nameLocked={false}
        />
      </Screen>
    );
  }

  if (!z.uuid().safeParse(id).success) notFound();
  const { db } = await openApp();
  const { data: category } = await db
    .from("categories")
    .select("id, name, kind, icon, is_ant, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (!category) notFound();
  const isProtected = PROTECTED_CATEGORIES.includes(category.name);
  const isHidden = category.archived_at !== null;

  return (
    <Screen>
      <ItemHeader backHref={BACK} title="Categoría" />
      <CategoryForm
        action={saveCategory.bind(null, category.id, category.kind)}
        kind={category.kind}
        nameLocked={isProtected}
        initial={{ name: category.name, icon: category.icon, isAnt: category.is_ant }}
      />
      {isProtected ? (
        <p className="px-1 text-[13px] text-muted-foreground">
          Esta categoría no se puede renombrar ni ocultar: es la que usas para crear categorías
          nuevas mientras registras.
        </p>
      ) : (
        <form action={setCategoryHidden.bind(null, category.id, !isHidden)}>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            {isHidden ? "Volver a mostrar" : "Ocultar categoría"}
          </Button>
          <p className="mt-2 px-1 text-[13px] text-muted-foreground">
            {isHidden
              ? "Está oculta: no aparece al registrar, pero tus movimientos viejos la conservan."
              : "Al ocultarla deja de aparecer al registrar. Tus movimientos viejos la conservan."}
          </p>
        </form>
      )}
    </Screen>
  );
}

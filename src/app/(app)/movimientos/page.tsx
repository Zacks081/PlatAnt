import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";

import { HistoryFilters } from "@/components/movements/history-filters";
import { MovementList } from "@/components/movements/movement-list";
import { BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { todayInTimeZone } from "@/lib/dates";
import {
  getCategories,
  getMovements,
  getPockets,
  openApp,
  type HistoryFilters as Filters,
} from "@/lib/movements/data";
import { POCKET_LABELS } from "@/lib/movements/format";

export const metadata: Metadata = { title: "Movimientos" };

type Props = Pick<PageProps<"/movimientos">, "searchParams">;

export default function MovementsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Movements searchParams={searchParams} />
    </Suspense>
  );
}

const PERIODS = ["todo", "este-mes", "mes-pasado", "3-meses"] as const;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOrNull = (value: string | undefined) =>
  value && z.uuid().safeParse(value).success ? value : null;

async function Movements({ searchParams }: Props) {
  const params = await searchParams;
  const { user, db } = await openApp();

  const periodParam = one(params.periodo);
  const filters: Filters = {
    period: PERIODS.find((period) => period === periodParam) ?? "todo",
    categoryId: uuidOrNull(one(params.categoria)),
    pocketId: uuidOrNull(one(params.bolsillo)),
  };

  const [movements, expenseCategories, incomeCategories, pockets] = await Promise.all([
    getMovements(db, user, filters),
    getCategories(db, "expense", { includeHidden: true }),
    getCategories(db, "income", { includeHidden: true }),
    getPockets(db),
  ]);

  const query = new URLSearchParams(
    Object.entries({
      periodo: filters.period === "todo" ? null : filters.period,
      categoria: filters.categoryId,
      bolsillo: filters.pocketId,
    }).filter((entry): entry is [string, string] => entry[1] !== null),
  ).toString();
  const back = query ? `/movimientos?${query}` : "/movimientos";
  const isFiltered = filters.period !== "todo" || filters.categoryId || filters.pocketId;

  return (
    <Screen>
      <header className="flex min-h-11 items-center gap-3">
        <BackLink href="/" label="Volver al inicio" />
        <h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">Movimientos</h1>
      </header>

      <HistoryFilters
        period={filters.period}
        categoryId={filters.categoryId}
        pocketId={filters.pocketId}
        categories={[...expenseCategories, ...incomeCategories].map((category) => ({
          value: category.id,
          label: category.archived_at ? `${category.name} (oculta)` : category.name,
        }))}
        pockets={pockets.map((pocket) => ({
          value: pocket.id,
          label: POCKET_LABELS[pocket.kind] ?? pocket.name,
        }))}
      />

      {movements.length > 0 ? (
        <MovementList
          movements={movements}
          today={todayInTimeZone(user.timeZone)}
          currency={user.currency}
          back={back}
          grouped
        />
      ) : (
        <p className="rounded-[24px] bg-card p-5 text-muted-foreground">
          {isFiltered
            ? "No hay movimientos con estos filtros."
            : "Todavía no has registrado movimientos. Toca el botón + para agregar el primero."}
        </p>
      )}
    </Screen>
  );
}

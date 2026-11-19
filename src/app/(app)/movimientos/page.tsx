import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";

import { HistoryFilters } from "@/components/movements/history-filters";
import { MovementList } from "@/components/movements/movement-list";
import { BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { todayInTimeZone } from "@/lib/dates";
import {
  getCategories,
  getMovementsPage,
  getPockets,
  openApp,
  type HistoryFilters as Filters,
} from "@/lib/movements/data";
import { POCKET_LABELS } from "@/lib/movements/format";
import { MOVEMENT_TYPES, PERIODS, periodRange } from "@/lib/movements/periods";
import { getRecentPeriods } from "@/lib/pay-periods/data";

export const metadata: Metadata = { title: "Movimientos" };

type Props = Pick<PageProps<"/movimientos">, "searchParams">;

export default function MovementsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Movements searchParams={searchParams} />
    </Suspense>
  );
}

/** Movimientos por página. */
const PAGE_SIZE = 15;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const uuidOrNull = (value: string | undefined) =>
  value && z.uuid().safeParse(value).success ? value : null;

async function Movements({ searchParams }: Props) {
  const params = await searchParams;
  const { user, db } = await openApp();
  const today = todayInTimeZone(user.timeZone);

  // Las quincenas solo existen si te pagan cada quincena.
  const periods = PERIODS.filter(
    (option) => !option.value.includes("quincena") || user.payFrequency === "biweekly",
  );
  const period = periods.find((option) => option.value === one(params.periodo))?.value ?? null;
  const type = MOVEMENT_TYPES.find((option) => option.value === one(params.tipo))?.value ?? null;
  const custom = { from: one(params.desde) ?? null, to: one(params.hasta) ?? null };
  // Con pagos registrados, «esta quincena» empieza el día en que de verdad te pagaron.
  const [current, previous] = period?.includes("quincena") ? await getRecentPeriods(db, 2) : [];
  const registered = current
    ? { current: current.started_on, previous: previous?.started_on ?? null }
    : null;
  const { range, error: rangeError } = periodRange(period, today, user.payDays, custom, registered);

  const categoryKind = type === "gasto" ? "expense" : type === "ingreso" ? "income" : null;
  const filters: Filters = {
    range,
    type,
    categoryId: categoryKind ? uuidOrNull(one(params.categoria)) : null,
    pocketId: uuidOrNull(one(params.bolsillo)),
  };

  const page = Math.max(1, Math.floor(Number(one(params.pagina)) || 1));
  const [{ movements, total }, categories, pockets] = await Promise.all([
    getMovementsPage(db, filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    categoryKind ? getCategories(db, categoryKind, { includeHidden: true }) : null,
    getPockets(db),
  ]);

  const filterParams = Object.fromEntries(
    Object.entries({
      periodo: period,
      desde: period === "personalizado" ? custom.from : null,
      hasta: period === "personalizado" ? custom.to : null,
      tipo: type,
      categoria: filters.categoryId,
      bolsillo: filters.pocketId,
    }).filter((entry): entry is [string, string] => entry[1] !== null),
  );
  /** Dirección del historial con los filtros actuales en la página `n`. */
  const pageHref = (n: number) => {
    const query = new URLSearchParams({ ...filterParams, ...(n > 1 ? { pagina: String(n) } : {}) });
    return query.size > 0 ? `/movimientos?${query}` : "/movimientos";
  };
  const back = pageHref(page);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered = Boolean(period || type || filters.pocketId);

  return (
    <Screen>
      <header className="flex min-h-11 items-center gap-3">
        <BackLink href="/" label="Volver al inicio" />
        <h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">Movimientos</h1>
      </header>

      <HistoryFilters
        period={period}
        periods={periods.map(({ value, label }) => ({ value, label }))}
        type={type}
        types={MOVEMENT_TYPES.map(({ value, label }) => ({ value, label }))}
        categoryId={filters.categoryId}
        categories={
          categories?.map((category) => ({
            value: category.id,
            label: category.archived_at ? `${category.name} (oculta)` : category.name,
          })) ?? null
        }
        pocketId={filters.pocketId}
        pockets={pockets.map((pocket) => ({
          value: pocket.id,
          label: POCKET_LABELS[pocket.kind] ?? pocket.name,
        }))}
        custom={{ ...custom, error: rangeError }}
        today={today}
        minDate={{ year: today.year - 2, month: 1, day: 1 }}
      />

      {period === "personalizado" && !range ? null : movements.length > 0 ? (
        <MovementList
          movements={movements}
          today={today}
          currency={user.currency}
          back={back}
          grouped
        />
      ) : page > 1 ? (
        // Si la página ya no existe (por ejemplo, después de borrar), se ofrece volver.
        <p className="rounded-[24px] bg-card p-5 text-muted-foreground">
          Esta página ya no tiene movimientos.{" "}
          <Link href={pageHref(1)} className="font-semibold text-foreground underline">
            Ir a la primera
          </Link>
        </p>
      ) : (
        <p className="rounded-[24px] bg-card p-5 text-muted-foreground">
          {isFiltered
            ? "No hay movimientos con estos filtros."
            : "No tienes movimientos en los últimos 3 meses. Para ver los de antes, usa Fechas personalizadas."}
        </p>
      )}
      {pages > 1 && movements.length > 0 && (
        <Pagination page={page} pages={pages} href={pageHref} />
      )}
      {!period && movements.length > 0 && page === pages && (
        <p className="px-1 text-center text-[13px] text-muted-foreground">
          Aquí ves los últimos 3 meses. Para ver los de antes, usa Fechas personalizadas.
        </p>
      )}
    </Screen>
  );
}

/** «Anterior · Página 2 de 10 · Siguiente». */
function Pagination({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (n: number) => string;
}) {
  const button =
    "flex h-11 items-center gap-1 rounded-full px-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} scroll className={`${button} bg-secondary`}>
          <ChevronLeft aria-hidden="true" className="size-[18px]" />
          Anterior
        </Link>
      ) : (
        <span className="w-[110px]" />
      )}
      <span className="text-sm text-muted-foreground tabular-nums">
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} scroll className={`${button} bg-secondary`}>
          Siguiente
          <ChevronRight aria-hidden="true" className="size-[18px]" />
        </Link>
      ) : (
        <span className="w-[110px]" />
      )}
    </nav>
  );
}

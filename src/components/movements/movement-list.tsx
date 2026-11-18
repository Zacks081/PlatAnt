import Link from "next/link";

import { CategoryIcon } from "@/components/movements/category-icon";
import type { CalendarDate } from "@/lib/dates";
import type { MovementRow } from "@/lib/movements/data";
import { formatMoney } from "@/lib/money";
import { dayLabel, POCKET_LABELS, signedAmount } from "@/lib/movements/format";
import { cn } from "@/lib/utils";

type MovementListProps = {
  movements: MovementRow[];
  today: CalendarDate;
  currency: string;
  /** A dónde volver después de editar uno. */
  back: string;
  /** Agrupar por día (en el historial) o mostrar el día en cada fila (en el inicio). */
  grouped?: boolean;
};

/** Lista de movimientos. Cada uno abre su pantalla para editarlo o borrarlo. */
export function MovementList({
  movements,
  today,
  currency,
  back,
  grouped = false,
}: MovementListProps) {
  const groups = new Map<string, MovementRow[]>();
  for (const movement of movements) {
    const key = grouped ? movement.occurred_on : "todos";
    groups.set(key, [...(groups.get(key) ?? []), movement]);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([day, items]) => (
        <section key={day} className="flex flex-col gap-2">
          {grouped && (
            <h3 className="px-1 text-[13px] font-semibold text-muted-foreground">
              {dayLabel(day, today)}
            </h3>
          )}
          <ul className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-4">
            {items.map((movement) => {
              const kind = movement.kind;
              const isTransfer = kind === "transfer";
              const isWithdrawal = isTransfer && movement.pockets?.kind === "account";
              const pocket = POCKET_LABELS[movement.pockets?.kind ?? ""] ?? "";
              // En un traslado, el «nombre» es qué fue y el detalle, de dónde a dónde.
              const category = isTransfer
                ? isWithdrawal
                  ? "Retiro"
                  : "Consignación"
                : (movement.categories?.name ?? "Sin categoría");
              const where = isTransfer
                ? `${pocket} → ${POCKET_LABELS[movement.to_pocket?.kind ?? ""] ?? ""}`
                : pocket;
              return (
                <li key={movement.id}>
                  <Link
                    href={`/movimiento/${movement.id}?volver=${encodeURIComponent(back)}`}
                    className="flex min-h-16 items-center gap-3 rounded-lg py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <CategoryIcon
                      icon={
                        isTransfer
                          ? isWithdrawal
                            ? "retiro"
                            : "consignacion"
                          : movement.categories?.icon
                      }
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-semibold">
                        {movement.description || category}
                      </span>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {[
                          movement.description ? category : null,
                          where,
                          grouped ? null : dayLabel(movement.occurred_on, today),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-display text-base font-semibold tabular-nums",
                        kind === "income" ? "text-libre" : "text-foreground",
                      )}
                    >
                      {isTransfer
                        ? formatMoney(movement.amount, { currency })
                        : signedAmount(kind, movement.amount, currency)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

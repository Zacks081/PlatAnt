import Link from "next/link";

import { CategoryIcon } from "@/components/movements/category-icon";
import type { CalendarDate } from "@/lib/dates";
import type { MovementRow } from "@/lib/movements/data";
import { formatMoney } from "@/lib/money";
import { dayLabel, PAYDAY_LABEL, POCKET_LABELS, signedAmount } from "@/lib/movements/format";
import { reconciliationLabel } from "@/lib/pockets/pockets";
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
              // Plata que entra o sale del bolsillo de un gasto fijo.
              const fromFixed = movement.pockets?.kind === "fixed_expense";
              const toFixed = movement.to_pocket?.kind === "fixed_expense";
              const isPocketMove = isTransfer && (fromFixed || toFixed);
              const isWithdrawal = isTransfer && movement.pockets?.kind === "account";
              // Lo que registró un cuadre de saldo: no tiene categoría, tiene nombre propio.
              const isReconciliation = !isTransfer && movement.origin === "reconciliation";
              const isPayday = movement.origin === "payday";
              const pocket = pocketLabel(movement.pockets);
              // En un traslado, el «nombre» es qué fue y el detalle, de dónde a dónde.
              const category = isPocketMove
                ? toFixed
                  ? `Apartado ${movement.to_pocket?.name ?? ""}`
                  : `Sacado de ${movement.pockets?.name ?? ""}`
                : isTransfer
                  ? isWithdrawal
                    ? "Retiro"
                    : "Consignación"
                  : isReconciliation
                    ? reconciliationLabel(kind)
                    : isPayday
                      ? PAYDAY_LABEL
                      : (movement.categories?.name ?? "Sin categoría");
              const installments = movement.installment_plans[0]?.installments_count ?? 1;
              const where = isTransfer
                ? `${pocket} → ${pocketLabel(movement.to_pocket)}`
                : isReconciliation
                  ? `Cuadre de ${pocket.toLowerCase()}`
                  : installments > 1
                    ? `${pocket} · ${installments} cuotas`
                    : pocket;
              return (
                <li key={movement.id}>
                  <Link
                    href={`/movimiento/${movement.id}?volver=${encodeURIComponent(back)}`}
                    className="flex min-h-16 items-center gap-3 rounded-lg py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <CategoryIcon
                      icon={
                        isPocketMove
                          ? "bolsillo"
                          : isTransfer
                            ? isWithdrawal
                              ? "retiro"
                              : "consignacion"
                            : isReconciliation
                              ? "cuadre"
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

/** «Cuenta», «Efectivo», «Tarjeta» o, en un bolsillo de gasto fijo, su nombre. */
function pocketLabel(pocket: { kind: string; name: string } | null | undefined): string {
  if (!pocket) return "";
  return POCKET_LABELS[pocket.kind] ?? pocket.name;
}

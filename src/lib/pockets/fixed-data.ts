import "server-only";

import type { Db } from "@/lib/movements/data";

/** Lectura de los bolsillos de los gastos fijos, con la sesión del usuario. */

function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(
      `No se pudieron cargar los bolsillos: ${result.error?.message ?? "sin respuesta"}`,
    );
  }
  return result.data as NonNullable<T>;
}

const FIXED_FIELDS = "id, name, amount, due_day, categories(icon)" as const;

/** Los bolsillos de los gastos fijos que siguen vigentes, con su saldo, por gasto fijo. */
export async function getFixedPockets(db: Db) {
  const [pockets, balances] = await Promise.all([
    db
      .from("pockets")
      .select(`id, fixed_expense_id, fixed_expenses(${FIXED_FIELDS})`)
      .eq("kind", "fixed_expense")
      .is("archived_at", null),
    db.rpc("pocket_balances"),
  ]);
  const balanceOf = new Map(
    check(balances).map((row) => [row.pocket_id, Number(row.balance)] as const),
  );
  const byFixedExpense = new Map(
    check(pockets).flatMap((pocket) =>
      pocket.fixed_expense_id && pocket.fixed_expenses
        ? [
            [
              pocket.fixed_expense_id,
              {
                pocketId: pocket.id,
                balance: balanceOf.get(pocket.id) ?? 0,
                fixed: pocket.fixed_expenses,
              },
            ] as const,
          ]
        : [],
    ),
  );
  return byFixedExpense;
}

/**
 * Un bolsillo con todo lo de su pantalla: el gasto fijo, el saldo, el próximo vencimiento sin
 * pagar que tiene apartado (si hay) y sus movimientos, del más reciente al más viejo.
 */
export async function getFixedPocket(db: Db, fixedExpenseId: string) {
  const { data: row, error } = await db
    .from("pockets")
    .select(`id, fixed_expenses(${FIXED_FIELDS}, category_id)`)
    .eq("fixed_expense_id", fixedExpenseId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el bolsillo: ${error.message}`);
  if (!row?.fixed_expenses) return null;

  const [balance, nextDue, movements] = await Promise.all([
    db.rpc("pocket_balance", { p_pocket: row.id }),
    db
      .from("set_asides")
      .select("due_on")
      .eq("fixed_expense_id", fixedExpenseId)
      .is("paid_movement_id", null)
      .order("due_on")
      .limit(1)
      .maybeSingle(),
    db
      .from("movements")
      .select(
        "id, kind, origin, amount, occurred_on, description, pocket_id, to_pocket_id, pay_periods!movements_pay_period_fkey(pay_month, pay_slot)",
      )
      .or(`pocket_id.eq.${row.id},to_pocket_id.eq.${row.id}`)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    pocketId: row.id,
    fixed: row.fixed_expenses,
    balance: Number(check(balance)),
    nextDueOn: nextDue.data?.due_on ?? null,
    movements: check(movements),
  };
}

export type FixedPocket = NonNullable<Awaited<ReturnType<typeof getFixedPocket>>>;
export type PocketMovement = FixedPocket["movements"][number];

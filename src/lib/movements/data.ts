import "server-only";

import { requireOnboardedUser, type CurrentUser } from "@/lib/auth/session";
import type { DateRange, MovementType } from "@/lib/movements/periods";
import { createClient } from "@/lib/supabase/server";

/**
 * Lectura de movimientos, bolsillos y categorías. Todo pasa por el cliente con la sesión
 * del usuario, así que la base de datos solo entrega sus filas.
 */

export type Db = Awaited<ReturnType<typeof createClient>>;
export type MovementKind = "expense" | "income";

function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`No se pudieron cargar los datos: ${result.error?.message ?? "sin respuesta"}`);
  }
  return result.data as NonNullable<T>;
}

/** Usuario con la configuración terminada y su cliente de base de datos. */
export async function openApp(): Promise<{ user: CurrentUser; db: Db }> {
  const user = await requireOnboardedUser();
  return { user, db: await createClient() };
}

/** Saldo de cada bolsillo, calculado por la base de datos sumando movimientos. */
export async function getBalances(db: Db) {
  const rows = check(await db.rpc("pocket_balances"));
  const find = (kind: string) => rows.find((row) => row.kind === kind);
  const account = Number(find("account")?.balance ?? 0);
  const cash = Number(find("cash")?.balance ?? 0);
  const card = find("credit_card");
  // La plata de los bolsillos de los gastos fijos también es tuya: suma en el balance.
  const pockets = rows
    .filter((row) => row.kind === "fixed_expense")
    .reduce((total, row) => total + Number(row.balance), 0);
  return {
    account,
    cash,
    pockets,
    total: account + cash + pockets,
    /** Lo que se debe en la tarjeta (positivo), o `null` si no hay tarjeta. */
    cardDebt: card ? -Number(card.balance) : null,
  };
}

export async function getPockets(db: Db) {
  // Los bolsillos de los gastos fijos se manejan desde su propia pantalla, no en los formularios.
  return check(
    await db.from("pockets").select("id, kind, name").neq("kind", "fixed_expense").order("kind"),
  );
}

/** Categorías de un tipo, en orden alfabético y con «Otros» al final. */
export async function getCategories(
  db: Db,
  kind: MovementKind,
  { includeHidden = false }: { includeHidden?: boolean } = {},
) {
  let query = db
    .from("categories")
    .select("id, name, icon, is_ant, archived_at, kind")
    .eq("kind", kind)
    .order("name");
  if (!includeHidden) query = query.is("archived_at", null);
  const categories = check(await query);
  const isOther = (name: string) => name === "Otros" || name === "Otros ingresos";
  return [
    ...categories.filter((category) => !isOther(category.name)),
    ...categories.filter((category) => isOther(category.name)),
  ];
}

const MOVEMENT_FIELDS =
  "id, kind, origin, amount, occurred_on, description, category_id, pocket_id, to_pocket_id, categories(name, icon), pockets!movements_user_id_pocket_id_fkey(kind, name, fixed_expense_id), to_pocket:pockets!movements_user_id_to_pocket_id_fkey(kind, name, fixed_expense_id), installment_plans(installments_count)" as const;

export type HistoryFilters = {
  /** Rango de fechas, o `null` para cualquier fecha. */
  range: DateRange | null;
  type: MovementType | null;
  /** Solo cuenta con el tipo «gasto» o «ingreso». */
  categoryId: string | null;
  pocketId: string | null;
};

const NO_FILTERS: HistoryFilters = { range: null, type: null, categoryId: null, pocketId: null };

/**
 * Lo que se ve en el historial: lo registrado a mano, los ajustes del cuadre de saldo, los
 * pagos de «Me pagaron» y lo que cada quincena pasa sola a los bolsillos.
 */
const HISTORY_ORIGINS = ["manual", "reconciliation", "payday", "set_aside"] as const;

/**
 * Movimientos del historial, del más reciente al más antiguo, de a `limit` por página.
 * Devuelve también cuántos hay en total con esos filtros, para saber cuántas páginas hay.
 */
export async function getMovementsPage(
  db: Db,
  filters: HistoryFilters = NO_FILTERS,
  { limit, offset = 0 }: { limit: number; offset?: number },
) {
  let query = db
    .from("movements")
    .select(MOVEMENT_FIELDS, { count: "exact" })
    .in("origin", HISTORY_ORIGINS);

  if (filters.range) {
    query = query.gte("occurred_on", filters.range.from).lte("occurred_on", filters.range.to);
  }

  // Retiro: de la cuenta al efectivo. Consignación: del efectivo a la cuenta. (Lo que pasa a
  // los bolsillos de los gastos fijos también es un traslado, pero no es ninguno de los dos.)
  if (filters.type === "gasto") query = query.eq("kind", "expense");
  else if (filters.type === "ingreso") query = query.eq("kind", "income");
  else if (filters.type === "retiro" || filters.type === "consignacion") {
    const { data: pockets } = await db
      .from("pockets")
      .select("id, kind")
      .in("kind", ["account", "cash"]);
    const idOf = (kind: string) => pockets?.find((pocket) => pocket.kind === kind)?.id ?? "";
    const [from, to] = filters.type === "retiro" ? ["account", "cash"] : ["cash", "account"];
    query = query.eq("kind", "transfer").eq("pocket_id", idOf(from)).eq("to_pocket_id", idOf(to));
  } else query = query.in("kind", ["expense", "income", "transfer"]);

  if (filters.categoryId && (filters.type === "gasto" || filters.type === "ingreso")) {
    query = query.eq("category_id", filters.categoryId);
  }
  // Un traslado toca dos bolsillos: aparece al filtrar por cualquiera de los dos.
  if (filters.pocketId) {
    query = query.or(`pocket_id.eq.${filters.pocketId},to_pocket_id.eq.${filters.pocketId}`);
  }

  const result = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return { movements: check(result), total: result.count ?? 0 };
}

/** Los movimientos más recientes, sin contar el total (para el inicio). */
export async function getMovements(db: Db, filters: HistoryFilters = NO_FILTERS, limit = 200) {
  return (await getMovementsPage(db, filters, { limit })).movements;
}

export type MovementRow = Awaited<ReturnType<typeof getMovementsPage>>["movements"][number];

export async function getMovement(db: Db, id: string) {
  const result = await db
    .from("movements")
    .select(MOVEMENT_FIELDS)
    .eq("id", id)
    .in("origin", HISTORY_ORIGINS)
    .maybeSingle();
  if (result.error) throw new Error(`No se pudo cargar el movimiento: ${result.error.message}`);
  return result.data;
}

/** El costo de un retiro (el gasto unido a él), si lo tiene. */
export async function getTransferFee(db: Db, transferId: string) {
  const { data } = await db
    .from("movements")
    .select("amount")
    .eq("parent_id", transferId)
    .maybeSingle();
  return data?.amount ?? null;
}

/** La categoría y el bolsillo del último movimiento de ese tipo, para proponerlos de nuevo. */
export async function getLastUsed(db: Db, kind: MovementKind) {
  const result = await db
    .from("movements")
    .select("category_id, pocket_id")
    .eq("origin", "manual")
    .eq("kind", kind)
    // El costo de un retiro no cuenta: lo guarda la app, no lo eligió la persona.
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return result.data;
}

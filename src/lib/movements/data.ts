import "server-only";

import { requireOnboardedUser, type CurrentUser } from "@/lib/auth/session";
import { addMonths, formatIsoDate, lastDayOfMonthIso, todayInTimeZone } from "@/lib/dates";
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
  return {
    account,
    cash,
    total: account + cash,
    /** Lo que se debe en la tarjeta (positivo), o `null` si no hay tarjeta. */
    cardDebt: card ? -Number(card.balance) : null,
  };
}

export async function getPockets(db: Db) {
  return check(await db.from("pockets").select("id, kind, name").order("kind"));
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
  "id, kind, amount, occurred_on, description, category_id, pocket_id, categories(name, icon), pockets!movements_user_id_pocket_id_fkey(kind, name)" as const;

export type HistoryFilters = {
  period: "todo" | "este-mes" | "mes-pasado" | "3-meses";
  categoryId: string | null;
  pocketId: string | null;
};

/** Movimientos registrados a mano, del más reciente al más antiguo. */
export async function getMovements(
  db: Db,
  user: CurrentUser,
  filters: HistoryFilters = { period: "todo", categoryId: null, pocketId: null },
  limit = 200,
) {
  let query = db
    .from("movements")
    .select(MOVEMENT_FIELDS)
    .eq("origin", "manual")
    .in("kind", ["expense", "income"]);

  const today = todayInTimeZone(user.timeZone);
  const thisMonth = { year: today.year, month: today.month };
  const firstDay = (month: { year: number; month: number }) => formatIsoDate({ ...month, day: 1 });
  if (filters.period === "este-mes") query = query.gte("occurred_on", firstDay(thisMonth));
  if (filters.period === "mes-pasado") {
    const last = addMonths(thisMonth, -1);
    query = query.gte("occurred_on", firstDay(last)).lte("occurred_on", lastDayOfMonthIso(last));
  }
  if (filters.period === "3-meses") {
    query = query.gte("occurred_on", firstDay(addMonths(thisMonth, -2)));
  }
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.pocketId) query = query.eq("pocket_id", filters.pocketId);

  return check(
    await query
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export type MovementRow = Awaited<ReturnType<typeof getMovements>>[number];

export async function getMovement(db: Db, id: string) {
  const result = await db
    .from("movements")
    .select(MOVEMENT_FIELDS)
    .eq("id", id)
    .eq("origin", "manual")
    .maybeSingle();
  if (result.error) throw new Error(`No se pudo cargar el movimiento: ${result.error.message}`);
  return result.data;
}

/** La categoría y el bolsillo del último movimiento de ese tipo, para proponerlos de nuevo. */
export async function getLastUsed(db: Db, kind: MovementKind) {
  const result = await db
    .from("movements")
    .select("category_id, pocket_id")
    .eq("origin", "manual")
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return result.data;
}

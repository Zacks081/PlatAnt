"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { compareDates, formatIsoDate, todayInTimeZone } from "@/lib/dates";
import { setFlash } from "@/lib/flash";
import { firstFieldErrors, readForm, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { getBalances, openApp, type Db, type MovementKind } from "@/lib/movements/data";
import {
  categorySchema,
  movementSchema,
  OTHER_CATEGORIES,
  PROTECTED_CATEGORIES,
  reconcileSchema,
  safeReturnPath,
  transferSchema,
} from "@/lib/movements/validation";
import {
  POCKET_NOUNS,
  POCKET_PATHS,
  reconciliation,
  reconciliationLabel,
  type CashPocket,
} from "@/lib/pockets/pockets";

/**
 * Acciones de movimientos y categorías. Cada una comprueba la sesión, valida lo que llega y
 * escribe con los permisos del propio usuario.
 */

const SAVE_ERROR = "No pudimos guardar. Intenta de nuevo en un momento.";
const CATEGORIES_PATH = "/ajustes/categorias";
const idSchema = z.uuid();

/**
 * Si al guardar la cuenta o el efectivo quedó en negativo, se avisa (pero no se bloquea):
 * devuelve la frase que se suma al aviso, o "" si todo está bien.
 */
async function negativeWarning(db: Db, pockets: readonly string[]): Promise<string> {
  const balances = await getBalances(db);
  const negative = (["account", "cash"] as const).filter(
    (kind) => pockets.includes(kind) && balances[kind] < 0,
  );
  if (negative.length === 0) return "";
  const names = negative.map((kind) => POCKET_NOUNS[kind].the);
  const subject = names.join(" y ");
  return `. Ojo: ${subject} ${negative.length > 1 ? "quedaron" : "quedó"} en negativo`;
}

/** Después de guardar, el navegador olvida sus copias de las pantallas y se va a `path`. */
function finish(path: string): never {
  revalidatePath("/", "layout");
  redirect(path);
}

/**
 * La categoría con la que se guarda. Si la elegida es «Otros» y se escribió un nombre, se usa
 * una categoría con ese nombre: la que ya exista (aunque esté oculta, se vuelve a mostrar) o
 * una nueva.
 */
async function resolveCategory(
  db: Db,
  kind: MovementKind,
  categoryId: string,
  newName: string,
  currentCategoryId: string | null,
): Promise<{ id: string } | { error: string }> {
  const { data: chosen } = await db
    .from("categories")
    .select("id, name, kind, archived_at")
    .eq("id", categoryId)
    .maybeSingle();
  if (!chosen || chosen.kind !== kind) return { error: "Elige una categoría." };
  // Una categoría oculta solo sirve si el movimiento ya la tenía.
  if (chosen.archived_at && chosen.id !== currentCategoryId)
    return { error: "Elige una categoría." };
  if (!OTHER_CATEGORIES.includes(chosen.name) || newName === "") return { id: chosen.id };

  const { data: existing } = await db
    .from("categories")
    .select("id, archived_at")
    .eq("kind", kind)
    .ilike("name", newName.replace(/[%_\\]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.archived_at) {
      await db.from("categories").update({ archived_at: null }).eq("id", existing.id);
    }
    return { id: existing.id };
  }
  const { data: created, error } = await db
    .from("categories")
    .insert({ name: newName, kind, icon: "otros" })
    .select("id")
    .single();
  return error ? { error: SAVE_ERROR } : { id: created.id };
}

/**
 * El plan de cuotas de un gasto con tarjeta: se crea o se actualiza con el valor y las cuotas,
 * y se quita si el gasto deja de ser con tarjeta. Devuelve el error, si lo hubo.
 */
async function syncCardPlan(
  db: Db,
  movementId: string,
  isCard: boolean,
  plan: { principal: number; installments: number; name: string },
): Promise<string | null> {
  if (!isCard) {
    const { error } = await db.from("installment_plans").delete().eq("movement_id", movementId);
    return error?.message ?? null;
  }
  const { data: card } = await db.from("credit_cards").select("id").maybeSingle();
  if (!card) return "No hay tarjeta registrada";

  const row = {
    name: plan.name.slice(0, 60),
    kind: "purchase" as const,
    principal: plan.principal,
    installments_count: plan.installments,
  };
  const { data: existing } = await db
    .from("installment_plans")
    .select("id")
    .eq("movement_id", movementId)
    .maybeSingle();
  const { error } = existing
    ? await db.from("installment_plans").update(row).eq("id", existing.id)
    : await db
        .from("installment_plans")
        .insert({ ...row, credit_card_id: card.id, movement_id: movementId, is_initial: false });
  return error?.message ?? null;
}

/** Guardar un gasto o un ingreso, nuevo (`id` en null) o editado. */
export async function saveMovement(
  kind: MovementKind,
  id: string | null,
  back: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, [
    "amount",
    "categoryId",
    "newCategory",
    "pocketId",
    "date",
    "description",
    "installments",
  ]);

  const parsed = movementSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const movement = parsed.data;

  if (compareDates(movement.date, todayInTimeZone(user.timeZone)) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  let current: { category_id: string | null } | null = null;
  if (id) {
    const { data } = await db
      .from("movements")
      .select("category_id")
      .eq("id", idSchema.parse(id))
      .eq("origin", "manual")
      .maybeSingle();
    if (!data) return { message: "Ese movimiento ya no existe.", values };
    current = data;
  }

  const category = await resolveCategory(
    db,
    kind,
    movement.categoryId,
    movement.newCategory,
    current?.category_id ?? null,
  );
  if ("error" in category) return { errors: { categoryId: category.error }, values };

  const { data: pocket } = await db
    .from("pockets")
    .select("kind")
    .eq("id", movement.pocketId)
    .maybeSingle();
  // Los bolsillos de los gastos fijos se manejan desde su pantalla, no desde este formulario.
  if (
    !pocket ||
    pocket.kind === "fixed_expense" ||
    (kind === "income" && pocket.kind === "credit_card")
  ) {
    return {
      errors: { pocketId: kind === "income" ? "Elige a dónde entra." : "Elige de dónde sale." },
      values,
    };
  }

  // Un gasto con tarjeta pregunta a cuántas cuotas: de eso sale lo que se paga cada mes.
  const isCard = kind === "expense" && pocket.kind === "credit_card";
  const installments = Number(movement.installments || "1");
  if (isCard && (!Number.isInteger(installments) || installments < 1 || installments > 120)) {
    return { errors: { installments: "Escribe a cuántas cuotas (1 a 120)." }, values };
  }

  const row = {
    amount: movement.amount,
    category_id: category.id,
    pocket_id: movement.pocketId,
    occurred_on: formatIsoDate(movement.date),
    description: movement.description || null,
  };
  const saved = id
    ? await db
        .from("movements")
        .update(row)
        .eq("id", id)
        .eq("origin", "manual")
        .select("id")
        .single()
    : await db
        .from("movements")
        .insert({ ...row, kind, origin: "manual" })
        .select("id")
        .single();
  if (saved.error) return { message: SAVE_ERROR, values };

  const planError = await syncCardPlan(db, saved.data.id, isCard, {
    principal: movement.amount,
    installments,
    name: movement.description || movement.newCategory || "Compra con tarjeta",
  });
  if (planError) return { message: SAVE_ERROR, values };

  const warning = kind === "expense" ? await negativeWarning(db, [pocket.kind]) : "";
  await setFlash(
    `${kind === "expense" ? "Gasto" : "Ingreso"} de ${formatMoney(movement.amount, { currency: user.currency })} ${id ? "actualizado" : "guardado"}${warning}`,
  );
  finish(safeReturnPath(back));
}

export async function deleteMovement(id: string, back: string): Promise<void> {
  const { db } = await openApp();
  // El costo de un retiro se borra con él (la base de datos lo hace sola).
  await db
    .from("movements")
    .delete()
    .eq("id", idSchema.parse(id))
    .in("origin", ["manual", "reconciliation"]);
  await setFlash("Movimiento borrado");
  finish(safeReturnPath(back));
}

// --- Categorías -------------------------------------------------------------

export async function saveCategory(
  id: string | null,
  kind: MovementKind,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { db } = await openApp();
  const values = readForm(formData, ["name", "icon", "isAnt"]);

  const parsed = categorySchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };

  if (id) {
    const { data: current } = await db
      .from("categories")
      .select("name")
      .eq("id", idSchema.parse(id))
      .maybeSingle();
    if (!current) return { message: "Esa categoría ya no existe.", values };
    if (PROTECTED_CATEGORIES.includes(current.name) && current.name !== parsed.data.name) {
      return { errors: { name: "Esta categoría no se puede renombrar." }, values };
    }
  }

  const row = {
    name: parsed.data.name,
    icon: parsed.data.icon,
    // Solo los gastos pueden ser «hormiga».
    is_ant: kind === "expense" && parsed.data.isAnt,
  };
  const { error } = id
    ? await db.from("categories").update(row).eq("id", id)
    : await db.from("categories").insert({ ...row, kind });
  if (error?.code === "23505") {
    return { errors: { name: "Ya tienes una categoría con ese nombre." }, values };
  }
  if (error) return { message: SAVE_ERROR, values };

  await setFlash(id ? "Categoría actualizada" : "Categoría creada");
  finish(CATEGORIES_PATH);
}

/** Ocultar o volver a mostrar una categoría. Sus movimientos viejos no cambian. */
export async function setCategoryHidden(id: string, hidden: boolean): Promise<void> {
  const { db } = await openApp();
  const { data: current } = await db
    .from("categories")
    .select("name")
    .eq("id", idSchema.parse(id))
    .maybeSingle();
  if (current && !PROTECTED_CATEGORIES.includes(current.name)) {
    await db
      .from("categories")
      .update({ archived_at: hidden ? new Date().toISOString() : null })
      .eq("id", id);
    await setFlash(hidden ? "Categoría oculta" : "Categoría visible otra vez");
  }
  finish(CATEGORIES_PATH);
}

// --- Retiros y consignaciones -----------------------------------------------

/** Guardar un retiro (cuenta → efectivo) o una consignación (efectivo → cuenta). */
export async function saveTransfer(
  direction: "withdrawal" | "deposit",
  id: string | null,
  back: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["amount", "date", "description", "fee"]);

  const parsed = transferSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const transfer = parsed.data;

  if (compareDates(transfer.date, todayInTimeZone(user.timeZone)) > 0) {
    return { errors: { date: "La fecha no puede ser después de hoy." }, values };
  }

  // Todo de una vez en la base de datos: el traslado y, en un retiro, su costo como gasto
  // aparte. Al editar, el sentido del traslado no cambia.
  const isWithdrawal = direction === "withdrawal";
  const { error } = await db.rpc("save_transfer", {
    p_from: isWithdrawal ? "account" : "cash",
    p_amount: transfer.amount,
    p_occurred_on: formatIsoDate(transfer.date),
    p_id: id ? idSchema.parse(id) : undefined,
    p_description: transfer.description || undefined,
    p_fee: isWithdrawal ? transfer.fee : 0,
  });
  if (error?.code === "P0002") return { message: "Ese movimiento ya no existe.", values };
  if (error) return { message: SAVE_ERROR, values };

  const money = (amount: number) => formatMoney(amount, { currency: user.currency });
  const what = isWithdrawal ? "Retiro" : "Consignación";
  const done = id
    ? isWithdrawal
      ? "actualizado"
      : "actualizada"
    : isWithdrawal
      ? "guardado"
      : "guardada";
  const fee = isWithdrawal && transfer.fee > 0 ? ` (y su costo de ${money(transfer.fee)})` : "";
  const warning = await negativeWarning(db, [isWithdrawal ? "account" : "cash"]);
  await setFlash(`${what} de ${money(transfer.amount)} ${done}${fee}${warning}`);
  finish(safeReturnPath(back));
}

// --- Cuadre de saldo --------------------------------------------------------

/**
 * Cuadrar la cuenta o el efectivo: el usuario escribe cuánto tiene de verdad y la diferencia
 * con lo que calcula la app se registra como «gasto sin registrar» o «ingreso sin registrar».
 * El cálculo lo hace la base de datos, contra el saldo que el usuario vio al cuadrar.
 */
export async function reconcilePocket(
  pocket: CashPocket,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, db } = await openApp();
  const values = readForm(formData, ["actual", "expected"]);

  const parsed = reconcileSchema.safeParse(values);
  if (!parsed.success) return { errors: firstFieldErrors(parsed.error), values };
  const { actual, expected } = parsed.data;

  const { data: difference, error } = await db.rpc("reconcile_pocket", {
    p_kind: pocket,
    p_expected: expected,
    p_actual: actual,
  });
  if (error?.code === "PA409") {
    // Se registró algo mientras tanto: la pantalla vuelve a cargar con el saldo nuevo.
    revalidatePath("/", "layout");
    return {
      message: "Tu saldo cambió mientras cuadrabas. Revisa la diferencia y vuelve a confirmar.",
      values: { actual: values.actual },
    };
  }
  if (error || difference === null) return { message: SAVE_ERROR, values };

  const result = reconciliation(expected, expected + difference);
  const nouns = POCKET_NOUNS[pocket];
  await setFlash(
    result.kind === "none"
      ? `Todo en orden: ${nouns.your} ya cuadraba`
      : `${nouns.reconciled}: ${reconciliationLabel(result.kind).toLowerCase()} de ${formatMoney(result.amount, { currency: user.currency })}`,
  );
  finish(POCKET_PATHS[pocket]);
}

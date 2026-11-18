"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { compareDates, formatIsoDate, todayInTimeZone } from "@/lib/dates";
import { setFlash } from "@/lib/flash";
import { firstFieldErrors, readForm, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { openApp, type Db, type MovementKind } from "@/lib/movements/data";
import {
  categorySchema,
  movementSchema,
  PROTECTED_CATEGORIES,
  safeReturnPath,
} from "@/lib/movements/validation";

/**
 * Acciones de movimientos y categorías. Cada una comprueba la sesión, valida lo que llega y
 * escribe con los permisos del propio usuario.
 */

const SAVE_ERROR = "No pudimos guardar. Intenta de nuevo en un momento.";
const CATEGORIES_PATH = "/ajustes/categorias";
const idSchema = z.uuid();

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
  if (!PROTECTED_CATEGORIES.includes(chosen.name) || newName === "") return { id: chosen.id };

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
  if (!pocket || (kind === "income" && pocket.kind === "credit_card")) {
    return {
      errors: { pocketId: kind === "income" ? "Elige a dónde entra." : "Elige de dónde sale." },
      values,
    };
  }

  const row = {
    amount: movement.amount,
    category_id: category.id,
    pocket_id: movement.pocketId,
    occurred_on: formatIsoDate(movement.date),
    description: movement.description || null,
  };
  const { error } = id
    ? await db.from("movements").update(row).eq("id", id).eq("origin", "manual")
    : await db.from("movements").insert({ ...row, kind, origin: "manual" });
  if (error) return { message: SAVE_ERROR, values };

  await setFlash(
    `${kind === "expense" ? "Gasto" : "Ingreso"} de ${formatMoney(movement.amount, { currency: user.currency })} ${id ? "actualizado" : "guardado"}`,
  );
  finish(safeReturnPath(back));
}

export async function deleteMovement(id: string, back: string): Promise<void> {
  const { db } = await openApp();
  await db.from("movements").delete().eq("id", idSchema.parse(id)).eq("origin", "manual");
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

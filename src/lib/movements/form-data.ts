import "server-only";

import type { Option } from "@/components/forms/fields";
import type { CurrentUser } from "@/lib/auth/session";
import { formatIsoDate, todayInTimeZone } from "@/lib/dates";
import { getCategories, getPockets, type Db, type MovementKind } from "@/lib/movements/data";
import { POCKET_LABELS } from "@/lib/movements/format";

/** Lo que necesita el formulario de un movimiento: categorías, bolsillos y fechas. */
export async function movementFormData(
  db: Db,
  user: CurrentUser,
  kind: MovementKind,
  /** Al editar, la categoría que ya tiene el movimiento se ofrece aunque esté oculta. */
  currentCategoryId: string | null = null,
) {
  const [categories, pockets] = await Promise.all([
    getCategories(db, kind, { includeHidden: true }),
    getPockets(db),
  ]);
  const today = todayInTimeZone(user.timeZone);
  const visible = categories.filter(
    (category) => !category.archived_at || category.id === currentCategoryId,
  );

  return {
    categories: visible.map((category): Option => ({ value: category.id, label: category.name })),
    otherCategoryId:
      visible.find((category) => category.name === "Otros" || category.name === "Otros ingresos")
        ?.id ?? null,
    /** El bolsillo de la tarjeta: al elegirlo se pregunta a cuántas cuotas. */
    cardPocketId: pockets.find((pocket) => pocket.kind === "credit_card")?.id ?? null,
    // A la tarjeta no le entra plata: un ingreso va a la cuenta o al efectivo.
    pockets: pockets
      .filter((pocket) => kind === "expense" || pocket.kind !== "credit_card")
      .map((pocket): Option => ({
        value: pocket.id,
        label: POCKET_LABELS[pocket.kind] ?? pocket.name,
      })),
    today,
    todayIso: formatIsoDate(today),
    // Se pueden registrar movimientos de hasta dos años atrás.
    minDate: { year: today.year - 2, month: 1, day: 1 },
  };
}

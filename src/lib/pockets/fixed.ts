import { addMonths, clampDayToMonth, formatIsoDate, type CalendarDate } from "@/lib/dates";

/**
 * Bolsillos de los gastos fijos: cada gasto fijo tiene uno, como los bolsillos de los bancos.
 * La quincena pasa ahí, sola, lo que le toca; desde el bolsillo se aparta más, se saca o se
 * paga. Las cifras las calcula este código, no la IA.
 */

/** La pantalla del bolsillo de un gasto fijo. */
export function fixedPocketPath(fixedExpenseId: string): string {
  return `/bolsillos/${fixedExpenseId}`;
}

/** Qué se hace desde un bolsillo y cómo se llama en la dirección: /bolsillos/<id>/pagar. */
export const POCKET_ACTIONS = { apartar: "in", sacar: "out", pagar: "pay" } as const;
export type PocketAction = (typeof POCKET_ACTIONS)[keyof typeof POCKET_ACTIONS];

export function pocketActionFromSlug(slug: string): PocketAction | null {
  return Object.hasOwn(POCKET_ACTIONS, slug)
    ? POCKET_ACTIONS[slug as keyof typeof POCKET_ACTIONS]
    : null;
}

/** El próximo día de pago de un gasto fijo desde hoy (puede ser hoy), ajustado al mes. */
export function nextDueDate(today: CalendarDate, dueDay: number): CalendarDate {
  const thisMonth = { year: today.year, month: today.month };
  const day = clampDayToMonth(dueDay, thisMonth);
  if (day >= today.day) return { ...thisMonth, day };
  const next = addMonths(thisMonth, 1);
  return { ...next, day: clampDayToMonth(dueDay, next) };
}

/**
 * Qué vencimiento muestra el bolsillo. Un gasto fijo se paga una vez por mes: si ya hay un
 * pago este mes, ese mes está pagado y lo que sigue es el vencimiento del mes siguiente. Si
 * no, el vencimiento pendiente más cercano (aunque ya haya pasado) o, si no tiene ninguno
 * apartado, el próximo según su día.
 */
export function pocketDue(
  today: CalendarDate,
  dueDay: number,
  { unpaidDueOn, lastPaymentOn }: { unpaidDueOn: string | null; lastPaymentOn: string | null },
): { dueOn: string; paidThisMonth: boolean } {
  const thisMonth = `${today.year}-${String(today.month).padStart(2, "0")}`;
  if (lastPaymentOn?.startsWith(thisMonth)) {
    const next = addMonths(today, 1);
    return {
      dueOn: formatIsoDate({ ...next, day: clampDayToMonth(dueDay, next) }),
      paidThisMonth: true,
    };
  }
  return {
    dueOn: unpaidDueOn ?? formatIsoDate(nextDueDate(today, dueDay)),
    paidThisMonth: false,
  };
}

/**
 * Cómo va un bolsillo frente al valor de su gasto: cuánto falta para completarlo, si ya
 * alcanza y qué tan lleno está (de 0 a 1, para la barra).
 */
export function pocketProgress(balance: number, total: number) {
  return {
    missing: Math.max(0, total - balance),
    ready: balance >= total,
    filled: total > 0 ? Math.min(1, Math.max(0, balance / total)) : 0,
  };
}

export type QuincenaPocket = {
  balance: number;
  total: number;
  /** Lo que se pagó en esta quincena, o `null` si todavía no se ha pagado. */
  paidAmount: number | null;
};

/**
 * Totales de los gastos fijos de la quincena:
 * - en bolsillos: lo que tienen los bolsillos de lo que falta pagar;
 * - pagado: lo que ya se pagó;
 * - falta: lo que les falta a los bolsillos para completar lo que no se ha pagado.
 */
export function quincenaPocketTotals(items: readonly QuincenaPocket[]) {
  let inPockets = 0;
  let paid = 0;
  let missing = 0;
  for (const item of items) {
    if (item.paidAmount !== null) {
      paid += item.paidAmount;
    } else {
      inPockets += Math.max(0, item.balance);
      missing += pocketProgress(item.balance, item.total).missing;
    }
  }
  return {
    inPockets,
    paid,
    missing,
    count: items.length,
    paidCount: items.filter((item) => item.paidAmount !== null).length,
  };
}

export type PocketMovementInput = {
  kind: "expense" | "income" | "transfer";
  origin: string;
  description: string | null;
  to_pocket_id: string | null;
};

/** Cómo se llama un movimiento dentro del bolsillo y si le entró plata o le salió. */
export function pocketMovementLabel(
  movement: PocketMovementInput,
  pocketId: string,
): { title: string; incoming: boolean } {
  const incoming = movement.to_pocket_id === pocketId || movement.kind === "income";
  if (movement.origin === "opening_balance") return { title: "Ya lo tenías apartado", incoming };
  if (movement.origin === "set_aside") return { title: "Apartado de la quincena", incoming };
  if (movement.kind === "expense") return { title: movement.description ?? "Pago", incoming };
  if (movement.description) return { title: movement.description, incoming };
  return { title: incoming ? "Apartaste de la cuenta" : "Sacaste a la cuenta", incoming };
}

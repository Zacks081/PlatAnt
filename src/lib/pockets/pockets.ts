/** Bolsillos de plata (cuenta y efectivo) y el cuadre de saldo. */

export type CashPocket = "account" | "cash";

/** Cómo se llama cada bolsillo en la dirección de su pantalla: /bolsillo/cuenta. */
export const POCKET_SLUGS: Record<string, CashPocket> = { cuenta: "account", efectivo: "cash" };

export const POCKET_PATHS: Record<CashPocket, string> = {
  account: "/bolsillo/cuenta",
  cash: "/bolsillo/efectivo",
};

/** «la cuenta», «el efectivo»: para armar frases. */
export const POCKET_NOUNS: Record<
  CashPocket,
  { the: string; your: string; name: string; reconciled: string }
> = {
  account: { the: "la cuenta", your: "tu cuenta", name: "Cuenta", reconciled: "Cuenta cuadrada" },
  cash: {
    the: "el efectivo",
    your: "tu efectivo",
    name: "Efectivo",
    reconciled: "Efectivo cuadrado",
  },
};

export function pocketFromSlug(slug: string): CashPocket | null {
  return Object.hasOwn(POCKET_SLUGS, slug) ? POCKET_SLUGS[slug] : null;
}

export type Reconciliation =
  | { kind: "none"; difference: 0; amount: 0 }
  | { kind: "expense" | "income"; difference: number; amount: number };

/**
 * Lo que registra un cuadre: si hay menos de lo que calcula la app, un «gasto sin registrar»
 * por la diferencia; si hay más, un «ingreso sin registrar»; si es igual, nada.
 */
export function reconciliation(expected: number, actual: number): Reconciliation {
  const difference = actual - expected;
  if (difference === 0) return { kind: "none", difference: 0, amount: 0 };
  return {
    kind: difference < 0 ? "expense" : "income",
    difference,
    amount: Math.abs(difference),
  };
}

/** Nombre que lleva en el historial un movimiento del cuadre. */
export function reconciliationLabel(kind: "expense" | "income"): string {
  return kind === "expense" ? "Gasto sin registrar" : "Ingreso sin registrar";
}

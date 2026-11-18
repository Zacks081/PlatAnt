import { appConfig } from "@/config/app";

/** Tope de cualquier monto: cabe en la columna de la base de datos y sobra para un usuario real. */
export const MAX_AMOUNT = 2_000_000_000;
const MAX_DIGITS = String(MAX_AMOUNT).length;

/**
 * Convierte lo que la persona va escribiendo en un monto entero.
 * Ignora todo lo que no sea dígito (puntos, espacios, el signo $). Vacío es `null`.
 */
export function parseMoneyInput(text: string): number | null {
  const digits = text.replace(/\D/g, "").slice(0, MAX_DIGITS);
  if (digits === "") return null;
  return Number(digits);
}

/**
 * Lo que se muestra en el campo mientras se escribe: el monto con puntos de miles
 * («1200000» → «1.200.000»). No lleva signo de pesos; ese lo pone la pantalla.
 */
export function formatMoneyInput(
  text: string | number | null | undefined,
  locale: string = appConfig.defaults.locale,
): string {
  const amount = parseMoneyInput(String(text ?? ""));
  if (amount === null) return "";
  return new Intl.NumberFormat(locale, { useGrouping: "always", maximumFractionDigits: 0 }).format(
    amount,
  );
}

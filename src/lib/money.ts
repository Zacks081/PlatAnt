import { appConfig } from "@/config/app";

export type MoneyOptions = {
  /** Código de la moneda, por ejemplo "COP". Sale del perfil del usuario. */
  currency?: string;
  /** Región que define los separadores, por ejemplo "es-CO". */
  locale?: string;
};

/**
 * Convierte un monto en texto para mostrar: 1200000 → "$1.200.000".
 *
 * Los montos de la app son siempre enteros, sin decimales. Si llega un número
 * con decimales es un error de quien llama, y se avisa en vez de redondear
 * a escondidas.
 */
export function formatMoney(amount: number, options: MoneyOptions = {}): string {
  if (!Number.isInteger(amount)) {
    throw new RangeError(`El monto debe ser un número entero y llegó ${amount}.`);
  }

  const { currency = appConfig.defaults.currency, locale = appConfig.defaults.locale } = options;

  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    // Sin esto, en español los números de cuatro cifras salen sin punto ("$1200").
    useGrouping: "always",
  }).formatToParts(Math.abs(amount));

  const symbol = parts.find((part) => part.type === "currency")?.value ?? "$";
  const digits = parts
    .filter((part) => part.type === "integer" || part.type === "group")
    .map((part) => part.value)
    .join("");

  return `${amount < 0 ? "-" : ""}${symbol}${digits}`;
}

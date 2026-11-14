import { describe, expect, it } from "vitest";

import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("separa los miles con punto", () => {
    expect(formatMoney(1_200_000)).toBe("$1.200.000");
    expect(formatMoney(48_000)).toBe("$48.000");
  });

  it("pone el punto también en números de cuatro cifras", () => {
    expect(formatMoney(1_200)).toBe("$1.200");
  });

  it("deja sin punto los valores menores de mil", () => {
    expect(formatMoney(999)).toBe("$999");
    expect(formatMoney(50)).toBe("$50");
  });

  it("muestra el cero", () => {
    expect(formatMoney(0)).toBe("$0");
  });

  it("no le pone signo al cero negativo", () => {
    expect(formatMoney(-0)).toBe("$0");
  });

  it("aguanta valores grandes", () => {
    expect(formatMoney(1_234_567_890)).toBe("$1.234.567.890");
    expect(formatMoney(999_999_999_999)).toBe("$999.999.999.999");
  });

  it("pone el signo menos antes del símbolo en los negativos", () => {
    expect(formatMoney(-40_000)).toBe("-$40.000");
    expect(formatMoney(-1)).toBe("-$1");
  });

  it("no acepta decimales, porque los montos son enteros", () => {
    expect(() => formatMoney(1_200.5)).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN)).toThrow(RangeError);
    expect(() => formatMoney(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("usa la moneda y la región del usuario cuando se indican", () => {
    expect(formatMoney(1_200_000, { currency: "USD", locale: "en-US" })).toBe("$1,200,000");
    expect(formatMoney(1_200_000, { currency: "EUR", locale: "es-CO" })).toBe("€1.200.000");
  });
});

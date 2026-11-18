import { describe, expect, it } from "vitest";

import { formatMoneyInput, MAX_AMOUNT, parseMoneyInput } from "./money-input";

describe("parseMoneyInput", () => {
  it("lee el monto aunque venga con puntos, espacios o el signo de pesos", () => {
    expect(parseMoneyInput("1.200.000")).toBe(1_200_000);
    expect(parseMoneyInput("$ 850.000")).toBe(850_000);
    expect(parseMoneyInput(" 45000 ")).toBe(45_000);
  });

  it("vacío o sin dígitos es null, no cero", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("$ ")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });

  it("cero escrito sí es cero", () => {
    expect(parseMoneyInput("0")).toBe(0);
    expect(parseMoneyInput("000")).toBe(0);
  });

  it("ignora comas y signos: nunca produce decimales ni negativos", () => {
    expect(parseMoneyInput("1.200,50")).toBe(120_050);
    expect(parseMoneyInput("-500")).toBe(500);
    expect(Number.isInteger(parseMoneyInput("12,5"))).toBe(true);
  });

  it("corta lo que se pase del largo máximo", () => {
    const digits = String(MAX_AMOUNT).length;
    expect(String(parseMoneyInput("9".repeat(digits + 5)))).toHaveLength(digits);
  });
});

describe("formatMoneyInput", () => {
  it("pone los puntos de miles mientras se escribe", () => {
    expect(formatMoneyInput("1")).toBe("1");
    expect(formatMoneyInput("1200")).toBe("1.200");
    expect(formatMoneyInput("120000")).toBe("120.000");
    expect(formatMoneyInput("1200000")).toBe("1.200.000");
  });

  it("vuelve a dar formato a algo ya formateado al que se le agregó un dígito", () => {
    expect(formatMoneyInput("1.200.0005")).toBe("12.000.005");
  });

  it("quita ceros a la izquierda y deja vacío lo vacío", () => {
    expect(formatMoneyInput("007")).toBe("7");
    expect(formatMoneyInput("")).toBe("");
    expect(formatMoneyInput(null)).toBe("");
  });

  it("acepta un número guardado", () => {
    expect(formatMoneyInput(2_400_000)).toBe("2.400.000");
  });

  it("ida y vuelta: lo que muestra se lee igual", () => {
    for (const amount of [0, 5, 999, 1_000, 123_456_789, MAX_AMOUNT]) {
      expect(parseMoneyInput(formatMoneyInput(amount))).toBe(amount);
    }
  });
});

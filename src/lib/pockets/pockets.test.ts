import { describe, expect, it } from "vitest";

import { firstFieldErrors } from "@/lib/forms";
import { reconcileSchema, transferSchema } from "@/lib/movements/validation";

import { pocketFromSlug, reconciliation, reconciliationLabel } from "./pockets";

describe("cuadre de saldo", () => {
  it("si hay menos plata de la esperada, registra un gasto por la diferencia", () => {
    expect(reconciliation(1_240_000, 1_180_000)).toEqual({
      kind: "expense",
      difference: -60_000,
      amount: 60_000,
    });
  });

  it("si hay más, registra un ingreso", () => {
    expect(reconciliation(50_000, 72_000)).toEqual({
      kind: "income",
      difference: 22_000,
      amount: 22_000,
    });
  });

  it("si es igual, no registra nada", () => {
    expect(reconciliation(50_000, 50_000)).toEqual({ kind: "none", difference: 0, amount: 0 });
  });

  it("un bolsillo en negativo se cuadra contra lo que hay de verdad", () => {
    expect(reconciliation(-30_000, 0)).toEqual({
      kind: "income",
      difference: 30_000,
      amount: 30_000,
    });
    expect(reconciliation(-30_000, 10_000).amount).toBe(40_000);
  });

  it("los movimientos del cuadre tienen nombre propio", () => {
    expect(reconciliationLabel("expense")).toBe("Gasto sin registrar");
    expect(reconciliationLabel("income")).toBe("Ingreso sin registrar");
  });

  it("acepta 0 como saldo real, pero no un campo vacío", () => {
    expect(reconcileSchema.parse({ actual: "0", expected: "5000" })).toEqual({
      actual: 0,
      expected: 5_000,
    });
    expect(reconcileSchema.parse({ actual: "1.180.000", expected: "-20" }).actual).toBe(1_180_000);
    const parsed = reconcileSchema.safeParse({ actual: "", expected: "0" });
    expect(parsed.success ? {} : firstFieldErrors(parsed.error)).toEqual({
      actual: "Escribe cuánto tienes.",
    });
  });
});

describe("retiro", () => {
  const valid = { amount: "200.000", date: "2026-11-18", description: "" };

  it("el costo es opcional: vacío es 0", () => {
    expect(transferSchema.parse({ ...valid, fee: "" }).fee).toBe(0);
    expect(transferSchema.parse({ ...valid, fee: "4.500" }).fee).toBe(4_500);
  });
});

describe("dirección de cada bolsillo", () => {
  it("cuenta y efectivo tienen pantalla; lo demás no", () => {
    expect(pocketFromSlug("cuenta")).toBe("account");
    expect(pocketFromSlug("efectivo")).toBe("cash");
    expect(pocketFromSlug("tarjeta")).toBeNull();
    expect(pocketFromSlug("constructor")).toBeNull();
  });
});

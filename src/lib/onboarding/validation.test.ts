import { describe, expect, it } from "vitest";

import { firstFieldErrors } from "@/lib/forms";

import {
  balancesSchema,
  cardSchema,
  debtSchema,
  fixedExpenseSchema,
  goalSchema,
  incomeSchema,
  planSchema,
} from "./validation";

const CATEGORY = "5b0f0e0a-3c1d-4f5e-9a7b-2c1d3e4f5a6b";

function errorsOf(schema: { safeParse: (input: unknown) => unknown }, input: unknown) {
  const parsed = schema.safeParse(input) as { success: boolean; error?: never };
  return parsed.success ? {} : firstFieldErrors(parsed.error!);
}

describe("ingresos", () => {
  const valid = {
    monthlyIncome: "2.400.000",
    payFrequency: "biweekly",
    payDay1: "15",
    payDay2: "30",
  };

  it("quincenal: guarda los dos días de pago", () => {
    expect(incomeSchema.parse(valid)).toEqual({
      monthlyIncome: 2_400_000,
      payFrequency: "biweekly",
      payDays: [15, 30],
    });
  });

  it("mensual: guarda un solo día e ignora el segundo", () => {
    expect(incomeSchema.parse({ ...valid, payFrequency: "monthly", payDay1: "30" })).toEqual({
      monthlyIncome: 2_400_000,
      payFrequency: "monthly",
      payDays: [30],
    });
    expect(incomeSchema.parse({ ...valid, payFrequency: "monthly", payDay2: "" }).payDays).toEqual([
      15,
    ]);
  });

  it("exige el ingreso", () => {
    expect(errorsOf(incomeSchema, { ...valid, monthlyIncome: "" }).monthlyIncome).toBe(
      "Escribe cuánto te entra al mes.",
    );
    expect(errorsOf(incomeSchema, { ...valid, monthlyIncome: "0" }).monthlyIncome).toBe(
      "Escribe cuánto te entra al mes.",
    );
  });

  it("quincenal: el segundo pago va después del primero", () => {
    expect(errorsOf(incomeSchema, { ...valid, payDay1: "30", payDay2: "15" }).payDay2).toMatch(
      /después del primero/,
    );
    expect(errorsOf(incomeSchema, { ...valid, payDay1: "15", payDay2: "15" }).payDay2).toMatch(
      /después del primero/,
    );
    expect(errorsOf(incomeSchema, { ...valid, payDay2: "" }).payDay2).toMatch(/segundo día/);
  });

  it("rechaza días que no existen y frecuencias inventadas", () => {
    expect(errorsOf(incomeSchema, { ...valid, payDay1: "0" }).payDay1).toBeDefined();
    expect(errorsOf(incomeSchema, { ...valid, payDay1: "32" }).payDay1).toBeDefined();
    expect(errorsOf(incomeSchema, { ...valid, payFrequency: "weekly" }).payFrequency).toBeDefined();
  });

  it("acepta el día 31", () => {
    expect(incomeSchema.parse({ ...valid, payDay2: "31" }).payDays).toEqual([15, 31]);
  });
});

describe("saldos", () => {
  it("lee los dos valores y toma vacío como cero", () => {
    expect(balancesSchema.parse({ account: "$ 850.000", cash: "" })).toEqual({
      account: 850_000,
      cash: 0,
    });
  });
});

describe("gasto fijo", () => {
  const valid = {
    amount: "700.000",
    name: "  Arriendo ",
    categoryId: CATEGORY,
    dueDay: "5",
    split: "first",
  };

  it("acepta uno válido y limpia el nombre", () => {
    expect(fixedExpenseSchema.parse(valid)).toEqual({
      amount: 700_000,
      name: "Arriendo",
      categoryId: CATEGORY,
      dueDay: 5,
      split: "first",
    });
  });

  it("exige valor, nombre, categoría, día y quincena", () => {
    const errors = errorsOf(fixedExpenseSchema, {
      amount: "",
      name: " ",
      categoryId: "",
      dueDay: "",
      split: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["amount", "categoryId", "dueDay", "name", "split"]);
  });

  it("rechaza una categoría que no es un identificador", () => {
    expect(errorsOf(fixedExpenseSchema, { ...valid, categoryId: "Vivienda" }).categoryId).toBe(
      "Elige una categoría.",
    );
  });
});

describe("tarjeta", () => {
  const valid = { statementDay: "15", paymentDay: "30", monthlyRate: "", debt: "1.350.000" };

  it("sin tasa escrita queda en null, para aplicar el 3 % estimado", () => {
    expect(cardSchema.parse(valid)).toEqual({
      statementDay: 15,
      paymentDay: 30,
      monthlyRate: null,
      debt: 1_350_000,
    });
  });

  it("lee la tasa con coma, con punto o con el signo de porcentaje", () => {
    expect(cardSchema.parse({ ...valid, monthlyRate: "2,1" }).monthlyRate).toBe(2.1);
    expect(cardSchema.parse({ ...valid, monthlyRate: "2.15" }).monthlyRate).toBe(2.15);
    expect(cardSchema.parse({ ...valid, monthlyRate: " 3 % " }).monthlyRate).toBe(3);
    expect(cardSchema.parse({ ...valid, monthlyRate: "0" }).monthlyRate).toBe(0);
  });

  it("rechaza tasas imposibles", () => {
    for (const monthlyRate of ["16", "-1", "abc", "2,123", "1e1"]) {
      expect(errorsOf(cardSchema, { ...valid, monthlyRate }).monthlyRate).toMatch(/entre 0 y 15/);
    }
  });

  it("no deber nada es válido", () => {
    expect(cardSchema.parse({ ...valid, debt: "" }).debt).toBe(0);
  });
});

describe("cuota en curso", () => {
  const valid = { principal: "960.000", name: "Avance", kind: "advance", installmentsCount: "8" };

  it("acepta una válida", () => {
    expect(planSchema.parse(valid)).toEqual({
      principal: 960_000,
      name: "Avance",
      kind: "advance",
      installmentsCount: 8,
    });
  });

  it("exige entre 1 y 120 cuotas, en número entero", () => {
    for (const installmentsCount of ["0", "121", "", "2,5", "-3"]) {
      expect(errorsOf(planSchema, { ...valid, installmentsCount }).installmentsCount).toBeDefined();
    }
  });
});

describe("deuda", () => {
  const valid = {
    originalAmount: "900.000",
    name: "Préstamo de mi mamá",
    installmentAmount: "150.000",
    paymentDay: "30",
    installmentsRemaining: "6",
  };

  it("acepta una válida", () => {
    expect(debtSchema.parse(valid)).toMatchObject({
      originalAmount: 900_000,
      installmentAmount: 150_000,
      paymentDay: 30,
      installmentsRemaining: 6,
    });
  });

  it("la cuota no puede ser mayor que la deuda", () => {
    expect(errorsOf(debtSchema, { ...valid, installmentAmount: "950.000" }).installmentAmount).toBe(
      "La cuota no puede ser mayor que lo que debes.",
    );
  });
});

describe("meta", () => {
  it("acepta una válida", () => {
    expect(
      goalSchema.parse({ targetAmount: "3.000.000", name: "Viaje", targetMonth: "2027-12" }),
    ).toEqual({ targetAmount: 3_000_000, name: "Viaje", targetMonth: { year: 2027, month: 12 } });
  });

  it("exige una fecha con forma de año y mes", () => {
    expect(
      errorsOf(goalSchema, { targetAmount: "1", name: "Viaje", targetMonth: "" }).targetMonth,
    ).toBe("Elige para cuándo la quieres.");
  });
});

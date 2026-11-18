import { describe, expect, it } from "vitest";

import { firstFieldErrors } from "@/lib/forms";

import { dayLabel, signedAmount } from "./format";
import { categorySchema, movementSchema, safeReturnPath } from "./validation";

const ID = "5b0f0e0a-3c1d-4f5e-9a7b-2c1d3e4f5a6b";
const valid = {
  amount: "18.000",
  categoryId: ID,
  newCategory: "",
  pocketId: ID,
  date: "2026-11-18",
  description: "  Almuerzo ",
};

const errorsOf = (input: unknown) => {
  const parsed = movementSchema.safeParse(input);
  return parsed.success ? {} : firstFieldErrors(parsed.error);
};

describe("movimiento", () => {
  it("acepta uno válido y limpia la descripción", () => {
    expect(movementSchema.parse(valid)).toEqual({
      amount: 18_000,
      categoryId: ID,
      newCategory: "",
      pocketId: ID,
      date: { year: 2026, month: 11, day: 18 },
      description: "Almuerzo",
    });
  });

  it("dice qué falta: el valor y la categoría", () => {
    const errors = errorsOf({ ...valid, amount: "", categoryId: "" });
    expect(errors.amount).toBe("Escribe el valor.");
    expect(errors.categoryId).toBe("Elige una categoría.");
  });

  it("el valor es un entero positivo, sin importar puntos o signos", () => {
    expect(errorsOf({ ...valid, amount: "0" }).amount).toBe("Escribe el valor.");
    expect(movementSchema.parse({ ...valid, amount: "-1.500" }).amount).toBe(1_500);
  });

  it("acepta fechas pasadas y rechaza fechas que no existen", () => {
    expect(movementSchema.parse({ ...valid, date: "2025-02-28" }).date).toEqual({
      year: 2025,
      month: 2,
      day: 28,
    });
    expect(errorsOf({ ...valid, date: "2026-02-30" }).date).toBe("Elige la fecha.");
  });

  it("la descripción es opcional y tiene tope", () => {
    expect(movementSchema.parse({ ...valid, description: "" }).description).toBe("");
    expect(errorsOf({ ...valid, description: "x".repeat(141) }).description).toMatch(/140/);
  });
});

describe("categoría", () => {
  it("acepta nombre, ícono y marca de hormiga", () => {
    expect(categorySchema.parse({ name: " Café ", icon: "cafe", isAnt: "true" })).toEqual({
      name: "Café",
      icon: "cafe",
      isAnt: true,
    });
  });

  it("exige nombre y un ícono con forma válida", () => {
    const parsed = categorySchema.safeParse({ name: " ", icon: "<script>", isAnt: "false" });
    expect(parsed.success).toBe(false);
    const errors = parsed.success ? {} : firstFieldErrors(parsed.error);
    expect(Object.keys(errors).sort()).toEqual(["icon", "name"]);
  });
});

describe("a dónde volver", () => {
  it("solo acepta rutas propias", () => {
    expect(safeReturnPath("/movimientos?categoria=x")).toBe("/movimientos?categoria=x");
    for (const path of [null, "", "https://malo.example", "//malo.example", "/\\malo"]) {
      expect(safeReturnPath(path)).toBe("/");
    }
  });
});

describe("formato", () => {
  it("el gasto lleva menos y el ingreso más", () => {
    expect(signedAmount("expense", 18_000)).toBe("−$18.000");
    expect(signedAmount("income", 1_200_000)).toBe("+$1.200.000");
  });

  it("nombra el día: hoy, ayer o la fecha corta", () => {
    const today = { year: 2026, month: 11, day: 18 };
    expect(dayLabel("2026-11-18", today)).toBe("Hoy");
    expect(dayLabel("2026-11-17", today)).toBe("Ayer");
    expect(dayLabel("2026-11-16", today)).toMatch(/^Lun 16 nov$/);
    expect(dayLabel("2025-12-31", today)).toMatch(/2025/);
    // «Ayer» también cruza el cambio de mes.
    expect(dayLabel("2026-11-30", { year: 2026, month: 12, day: 1 })).toBe("Ayer");
  });
});

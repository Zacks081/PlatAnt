import { describe, expect, it } from "vitest";

import {
  dayMonthLabel,
  inDaysLabel,
  nextPayStatus,
  paidCountLabel,
  setAsideTotals,
} from "./summary";

describe("totales de la quincena", () => {
  it("lo pagado sale de lo apartado; lo que falta es la diferencia", () => {
    expect(
      setAsideTotals([
        { amount: 350_000, paid_movement_id: "a" },
        { amount: 80_000, paid_movement_id: null },
        { amount: 200_000, paid_movement_id: null },
      ]),
    ).toEqual({ setAside: 630_000, paid: 350_000, pending: 280_000, count: 3, paidCount: 1 });
  });

  it("sin apartados, todo en cero", () => {
    expect(setAsideTotals([])).toEqual({
      setAside: 0,
      paid: 0,
      pending: 0,
      count: 0,
      paidCount: 0,
    });
  });
});

describe("próximo pago", () => {
  const today = { year: 2026, month: 11, day: 18 };

  it("cuenta los días que faltan", () => {
    expect(nextPayStatus(today, { year: 2026, month: 11, day: 30 })).toEqual({
      days: 12,
      due: false,
    });
  });

  it("el día del pago, o si ya pasó, se pregunta si ya llegó", () => {
    expect(nextPayStatus(today, today).due).toBe(true);
    expect(nextPayStatus(today, { year: 2026, month: 11, day: 13 })).toEqual({
      days: -5,
      due: true,
    });
  });

  it("textos", () => {
    expect(inDaysLabel(0)).toBe("hoy");
    expect(inDaysLabel(1)).toBe("mañana");
    expect(inDaysLabel(12)).toBe("en 12 días");
    expect(dayMonthLabel({ year: 2026, month: 11, day: 15 })).toBe("15 de noviembre");
    expect(paidCountLabel(1, 3)).toBe("1 de 3 pagos hechos");
    expect(paidCountLabel(3, 3)).toBe("Ya están todos pagados");
    expect(paidCountLabel(0, 0)).toBe("Sin pagos apartados");
  });
});

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MONTHLY_RATE,
  estimateFreeMoney,
  estimateState,
  goalContributionPerPayment,
  payPeriodForDay,
  planMonthlyPayment,
  resolveCardRate,
  type EstimateInput,
} from "./estimate";

describe("tasa de la tarjeta", () => {
  it("sin tasa: 3 % mensual, marcada como estimada", () => {
    expect(resolveCardRate(null)).toEqual({ monthlyRate: 3, isEstimated: true });
    expect(DEFAULT_MONTHLY_RATE).toBe(3);
  });

  it("con tasa: la del usuario, sin marca de estimada", () => {
    expect(resolveCardRate(2.1)).toEqual({ monthlyRate: 2.1, isEstimated: false });
  });

  it("una tasa de 0 es una tasa real, no «no la sé»", () => {
    expect(resolveCardRate(0)).toEqual({ monthlyRate: 0, isEstimated: false });
  });

  it("escribir justo 3 no la vuelve estimada", () => {
    expect(resolveCardRate(3)).toEqual({ monthlyRate: 3, isEstimated: false });
  });
});

describe("cuota de un plan", () => {
  it("reparte el saldo en las cuotas que faltan y redondea hacia arriba", () => {
    expect(planMonthlyPayment(960_000, 8)).toBe(120_000);
    expect(planMonthlyPayment(140_000, 2)).toBe(70_000);
    expect(planMonthlyPayment(100_000, 3)).toBe(33_334);
    expect(planMonthlyPayment(250_000, 1)).toBe(250_000);
  });
});

describe("aporte a la meta", () => {
  const base = { targetAmount: 3_000_000, today: { year: 2026, month: 11 } };

  it("quincenal: divide entre dos pagos por cada mes que falta", () => {
    expect(
      goalContributionPerPayment({
        ...base,
        target: { year: 2027, month: 12 },
        payFrequency: "biweekly",
      }),
    ).toBe(115_385); // 13 meses → 26 pagos
  });

  it("mensual: un pago por mes", () => {
    expect(
      goalContributionPerPayment({
        ...base,
        target: { year: 2027, month: 12 },
        payFrequency: "monthly",
      }),
    ).toBe(230_770);
  });

  it("si la fecha es este mes o ya pasó, toma un mes", () => {
    for (const target of [
      { year: 2026, month: 11 },
      { year: 2026, month: 5 },
    ]) {
      expect(goalContributionPerPayment({ ...base, target, payFrequency: "biweekly" })).toBe(
        1_500_000,
      );
    }
  });

  it("lo apartado alcanza para la meta", () => {
    const perPayment = goalContributionPerPayment({
      ...base,
      target: { year: 2027, month: 6 },
      payFrequency: "biweekly",
    });
    expect(perPayment * 14).toBeGreaterThanOrEqual(base.targetAmount);
  });
});

describe("de cuál pago sale un compromiso", () => {
  it("con pagos el 15 y el 30", () => {
    expect(payPeriodForDay(15, [15, 30])).toBe("first");
    expect(payPeriodForDay(29, [15, 30])).toBe("first");
    expect(payPeriodForDay(30, [15, 30])).toBe("second");
    expect(payPeriodForDay(31, [15, 30])).toBe("second");
    expect(payPeriodForDay(1, [15, 30])).toBe("second");
    expect(payPeriodForDay(14, [15, 30])).toBe("second");
  });

  it("con otros días de pago", () => {
    expect(payPeriodForDay(10, [5, 20])).toBe("first");
    expect(payPeriodForDay(25, [5, 20])).toBe("second");
    expect(payPeriodForDay(3, [5, 20])).toBe("second");
  });
});

/** Los datos de ejemplo del mockup del resumen. */
const example: EstimateInput = {
  monthlyIncome: 2_400_000,
  payFrequency: "biweekly",
  payDays: [15, 30],
  fixedExpenses: [
    { amount: 700_000, split: "first" },
    { amount: 180_000, split: "second" },
    { amount: 90_000, split: "half" },
    { amount: 45_000, split: "second" },
  ],
  debts: [{ installmentAmount: 150_000, paymentDay: 30 }],
  card: {
    paymentDay: 30,
    plans: [
      { principal: 960_000, installmentsCount: 8 },
      { principal: 140_000, installmentsCount: 2 },
    ],
  },
  goalPerPayment: 115_385,
};

describe("plata libre estimada", () => {
  it("resta gastos fijos, cuotas de deudas, cuotas de tarjeta y aporte a la meta", () => {
    expect(estimateFreeMoney(example)).toEqual({
      income: 2_400_000,
      fixedExpenses: 1_015_000,
      debts: 150_000,
      card: 190_000,
      goal: 230_770,
      free: 814_230,
      periods: { first: 339_615, second: 474_615 },
      state: "good",
    });
  });

  it("las dos quincenas suman lo libre del mes, también con valores impares", () => {
    const estimate = estimateFreeMoney({
      ...example,
      monthlyIncome: 2_400_001,
      fixedExpenses: [{ amount: 90_001, split: "half" }],
    });
    expect(estimate.periods!.first + estimate.periods!.second).toBe(estimate.free);
  });

  it("recorrido mínimo: solo ingreso, todo queda libre y partido en dos", () => {
    expect(
      estimateFreeMoney({
        monthlyIncome: 2_000_000,
        payFrequency: "biweekly",
        payDays: [15, 30],
        fixedExpenses: [],
        debts: [],
        card: null,
        goalPerPayment: 0,
      }),
    ).toMatchObject({ free: 2_000_000, periods: { first: 1_000_000, second: 1_000_000 } });
  });

  it("pago mensual: no hay quincenas y la meta se aparta una vez", () => {
    const estimate = estimateFreeMoney({
      ...example,
      payFrequency: "monthly",
      payDays: [30],
      goalPerPayment: 230_770,
    });
    expect(estimate.periods).toBeNull();
    expect(estimate.goal).toBe(230_770);
    expect(estimate.free).toBe(814_230);
  });

  it("una deuda que se paga entre los dos pagos sale de la primera quincena", () => {
    const estimate = estimateFreeMoney({
      ...example,
      debts: [{ installmentAmount: 150_000, paymentDay: 20 }],
    });
    expect(estimate.periods).toEqual({ first: 189_615, second: 624_615 });
  });

  it("una tarjeta sin cuotas en curso no resta nada", () => {
    expect(estimateFreeMoney({ ...example, card: { paymentDay: 30, plans: [] } }).card).toBe(0);
  });

  it("puede dar negativo cuando los compromisos superan el ingreso", () => {
    const estimate = estimateFreeMoney({ ...example, monthlyIncome: 1_000_000 });
    expect(estimate.free).toBe(-585_770);
    expect(estimate.state).toBe("bad");
  });

  it("siempre trabaja con pesos enteros", () => {
    const estimate = estimateFreeMoney({ ...example, monthlyIncome: 2_333_333 });
    for (const value of [estimate.free, estimate.periods!.first, estimate.periods!.second]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("estado según lo libre", () => {
  it("mal si no alcanza", () => {
    expect(estimateState(-1, 2_000_000)).toBe("bad");
  });

  it("regular si queda menos del 10 % del ingreso", () => {
    expect(estimateState(0, 2_000_000)).toBe("regular");
    expect(estimateState(199_999, 2_000_000)).toBe("regular");
  });

  it("bien desde el 10 %", () => {
    expect(estimateState(200_000, 2_000_000)).toBe("good");
    expect(estimateState(2_000_000, 2_000_000)).toBe("good");
  });
});

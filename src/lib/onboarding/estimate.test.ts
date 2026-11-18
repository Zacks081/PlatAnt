import { describe, expect, it } from "vitest";

import {
  DEFAULT_MONTHLY_RATE,
  estimateFreeMoney,
  estimateState,
  goalMonthlyContribution,
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

describe("cuota de lo que se debe en la tarjeta", () => {
  it("un avance paga capital más el interés del mes, aunque sea a una cuota", () => {
    // El caso del usuario de prueba de Santiago: 2.303.707 en 20 cuotas al 3 %.
    expect(
      planMonthlyPayment({ kind: "advance", principal: 2_303_707, installmentsCount: 20 }, 3),
    ).toBe(115_186 + 69_111);
    expect(
      planMonthlyPayment({ kind: "advance", principal: 100_000, installmentsCount: 1 }, 3),
    ).toBe(103_000);
  });

  it("una compra a varias cuotas paga interés; a una sola cuota, no", () => {
    expect(
      planMonthlyPayment({ kind: "purchase", principal: 140_000, installmentsCount: 2 }, 3),
    ).toBe(70_000 + 4_200);
    expect(
      planMonthlyPayment({ kind: "purchase", principal: 250_000, installmentsCount: 1 }, 3),
    ).toBe(250_000);
  });

  it("un plan mensual es su valor, sin intereses", () => {
    expect(
      planMonthlyPayment({ kind: "subscription", principal: 70_000, installmentsCount: 1 }, 3),
    ).toBe(70_000);
  });

  it("usa la tasa que tenga la tarjeta, y con 0 % no suma interés", () => {
    const plan = { kind: "advance" as const, principal: 1_000_000, installmentsCount: 10 };
    expect(planMonthlyPayment(plan, 2.15)).toBe(100_000 + 21_500);
    expect(planMonthlyPayment(plan, 0)).toBe(100_000);
  });

  it("redondea el capital hacia arriba y el interés al peso más cercano", () => {
    expect(
      planMonthlyPayment({ kind: "purchase", principal: 100_000, installmentsCount: 3 }, 2.5),
    ).toBe(33_334 + 2_500);
    expect(
      Number.isInteger(
        planMonthlyPayment({ kind: "advance", principal: 333_333, installmentsCount: 7 }, 2.17),
      ),
    ).toBe(true);
  });
});

describe("aporte a la meta", () => {
  const base = { targetAmount: 3_000_000, today: { year: 2026, month: 11 } };

  it("reparte el valor entre los meses que faltan, redondeando hacia arriba", () => {
    expect(goalMonthlyContribution({ ...base, target: { year: 2027, month: 12 } })).toBe(230_770); // 13 meses
  });

  it("si la fecha es este mes o ya pasó, toma un mes", () => {
    for (const target of [
      { year: 2026, month: 11 },
      { year: 2026, month: 5 },
    ]) {
      expect(goalMonthlyContribution({ ...base, target })).toBe(3_000_000);
    }
  });
});

describe("de cuál pago sale un pago único", () => {
  it("del último pago recibido antes de su día (con pagos el 15 y el 30)", () => {
    expect(payPeriodForDay(15, [15, 30])).toBe("first");
    expect(payPeriodForDay(29, [15, 30])).toBe("first");
    expect(payPeriodForDay(30, [15, 30])).toBe("second");
    expect(payPeriodForDay(1, [15, 30])).toBe("second");
    expect(payPeriodForDay(14, [15, 30])).toBe("second");
  });
});

/** El usuario de prueba de Santiago (17 de noviembre de 2026). */
const santiagoTest: EstimateInput = {
  monthlyIncome: 2_200_000,
  payFrequency: "biweekly",
  payDays: [15, 30],
  fixedExpenses: [
    { amount: 700_000, split: "half" },
    { amount: 180_000, split: "half" },
    { amount: 120_000, split: "half" },
  ],
  debts: [],
  card: {
    split: "half",
    monthlyRate: 3,
    plans: [
      { kind: "advance", principal: 2_303_707, installmentsCount: 20 },
      { kind: "subscription", principal: 70_000, installmentsCount: 1 },
    ],
  },
  goals: [],
};

describe("plata libre estimada", () => {
  it("caso real: el interés entra en la cuota y la tarjeta se reparte mitad y mitad", () => {
    // Tarjeta: 184.297 del avance (115.186 de capital + 69.111 de interés) + 70.000 del plan.
    expect(estimateFreeMoney(santiagoTest)).toEqual({
      income: 2_200_000,
      fixedExpenses: 1_000_000,
      debts: 0,
      card: 254_297,
      goal: 0,
      free: 945_703,
      periods: { first: 472_852, second: 472_851 },
      state: "good",
    });
  });

  it("la tarjeta sale de la quincena elegida", () => {
    const fromFirst = estimateFreeMoney({
      ...santiagoTest,
      card: { ...santiagoTest.card!, split: "first" },
    });
    expect(fromFirst.periods).toEqual({ first: 345_703, second: 600_000 });
    const fromSecond = estimateFreeMoney({
      ...santiagoTest,
      card: { ...santiagoTest.card!, split: "second" },
    });
    expect(fromSecond.periods).toEqual({ first: 600_000, second: 345_703 });
  });

  it("la cuota de una deuda sale de la quincena elegida", () => {
    const withDebt = (split: "first" | "second" | "half") =>
      estimateFreeMoney({
        ...santiagoTest,
        card: null,
        debts: [{ installmentAmount: 150_000, paymentDay: 30, split }],
      }).periods;
    expect(withDebt("first")).toEqual({ first: 450_000, second: 600_000 });
    expect(withDebt("second")).toEqual({ first: 600_000, second: 450_000 });
    expect(withDebt("half")).toEqual({ first: 525_000, second: 525_000 });
  });

  it("un pago único sale del pago anterior a su día", () => {
    const single = (paymentDay: number) =>
      estimateFreeMoney({
        ...santiagoTest,
        card: null,
        debts: [{ installmentAmount: 300_000, paymentDay, split: null }],
      }).periods;
    expect(single(20)).toEqual({ first: 300_000, second: 600_000 });
    expect(single(5)).toEqual({ first: 600_000, second: 300_000 });
  });

  it("las dos quincenas siempre suman lo libre del mes", () => {
    for (const split of ["first", "second", "half"] as const) {
      const estimate = estimateFreeMoney({
        ...santiagoTest,
        monthlyIncome: 2_200_001,
        card: { ...santiagoTest.card!, split },
        debts: [{ installmentAmount: 150_001, paymentDay: 30, split }],
      });
      expect(estimate.periods!.first + estimate.periods!.second).toBe(estimate.free);
    }
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
        goals: [],
      }),
    ).toMatchObject({ free: 2_000_000, periods: { first: 1_000_000, second: 1_000_000 } });
  });

  it("pago mensual: no hay quincenas y la meta se aparta una vez", () => {
    const estimate = estimateFreeMoney({
      ...santiagoTest,
      payFrequency: "monthly",
      payDays: [30],
      goals: [{ monthly: 100_000, split: "half" }],
    });
    expect(estimate.periods).toBeNull();
    expect(estimate.goal).toBe(100_000);
    expect(estimate.free).toBe(845_703);
  });

  it("el aporte a la meta sale de la quincena elegida", () => {
    const withGoal = (split: "first" | "second" | "half") =>
      estimateFreeMoney({ ...santiagoTest, card: null, goals: [{ monthly: 230_770, split }] });
    expect(withGoal("half").goal).toBe(230_770);
    expect(withGoal("half").periods).toEqual({ first: 484_615, second: 484_615 });
    expect(withGoal("first").periods).toEqual({ first: 369_230, second: 600_000 });
    expect(withGoal("second").periods).toEqual({ first: 600_000, second: 369_230 });
  });

  it("puede dar negativo cuando los compromisos superan el ingreso", () => {
    const estimate = estimateFreeMoney({ ...santiagoTest, monthlyIncome: 1_000_000 });
    expect(estimate.free).toBe(-254_297);
    expect(estimate.state).toBe("bad");
  });

  it("siempre trabaja con pesos enteros", () => {
    const estimate = estimateFreeMoney({ ...santiagoTest, monthlyIncome: 2_333_333 });
    for (const value of [estimate.free, estimate.periods!.first, estimate.periods!.second]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("estado según lo libre", () => {
  it("bien desde el 25 % del ingreso", () => {
    expect(estimateState(500_000, 2_000_000)).toBe("good");
    expect(estimateState(2_000_000, 2_000_000)).toBe("good");
  });

  it("regular entre el 15 % y el 25 %", () => {
    expect(estimateState(499_999, 2_000_000)).toBe("regular");
    expect(estimateState(300_000, 2_000_000)).toBe("regular");
  });

  it("mal por debajo del 15 % o si no alcanza", () => {
    expect(estimateState(299_999, 2_000_000)).toBe("bad");
    expect(estimateState(0, 2_000_000)).toBe("bad");
    expect(estimateState(-1, 2_000_000)).toBe("bad");
  });
});

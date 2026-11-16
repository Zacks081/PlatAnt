import { monthsBetween, type YearMonth } from "@/lib/dates";

/**
 * Cálculos de la configuración inicial. Todo lo de plata lo calcula este código,
 * con pesos enteros; nada de esto lo decide la IA.
 *
 * Son estimados para el resumen del recorrido. El cálculo real de cada quincena
 * (apartados, libre para gastar por día) llega con las issues 6 y 7.
 */

export type PayFrequency = "biweekly" | "monthly";
export type ExpenseSplit = "first" | "second" | "half";

/** Tasa mensual que se usa cuando el usuario no conoce la de su tarjeta. */
export const DEFAULT_MONTHLY_RATE = 3;

/** La tasa que se guarda: la que escribió el usuario, o 3 % marcada como estimada. */
export function resolveCardRate(rate: number | null): {
  monthlyRate: number;
  isEstimated: boolean;
} {
  return rate === null
    ? { monthlyRate: DEFAULT_MONTHLY_RATE, isEstimated: true }
    : { monthlyRate: rate, isEstimated: false };
}

/** Cuota mensual estimada de un plan: el saldo repartido en las cuotas que faltan, sin intereses. */
export function planMonthlyPayment(principal: number, installmentsCount: number): number {
  return Math.ceil(principal / Math.max(1, installmentsCount));
}

/** Pagos que se reciben al mes. */
export const paymentsPerMonth = (frequency: PayFrequency) => (frequency === "biweekly" ? 2 : 1);

/**
 * Cuánto hay que apartar en cada pago para llegar a la meta en su fecha.
 * Cuenta los meses que faltan hasta el mes de la meta; si ya es ese mes o pasó, toma uno.
 */
export function goalContributionPerPayment(input: {
  targetAmount: number;
  target: YearMonth;
  today: YearMonth;
  payFrequency: PayFrequency;
}): number {
  const months = Math.max(1, monthsBetween(input.today, input.target));
  return Math.ceil(input.targetAmount / (months * paymentsPerMonth(input.payFrequency)));
}

/**
 * De cuál pago sale un compromiso con día fijo (cuota de deuda, pago de tarjeta) cuando
 * se cobra por quincena: del último pago recibido antes de ese día.
 * Con pagos el 15 y el 30: del 15 al 29 sale del primero; el resto, del segundo.
 */
export function payPeriodForDay(day: number, payDays: readonly number[]): "first" | "second" {
  const [first, second] = payDays;
  return day >= first && day < second ? "first" : "second";
}

export type EstimateInput = {
  monthlyIncome: number;
  payFrequency: PayFrequency;
  payDays: readonly number[];
  fixedExpenses: readonly { amount: number; split: ExpenseSplit }[];
  debts: readonly { installmentAmount: number; paymentDay: number }[];
  card: {
    paymentDay: number;
    plans: readonly { principal: number; installmentsCount: number }[];
  } | null;
  /** Aporte a la meta en cada pago (ver goalContributionPerPayment). */
  goalPerPayment: number;
};

export type EstimateState = "good" | "regular" | "bad";

export type Estimate = {
  income: number;
  fixedExpenses: number;
  debts: number;
  card: number;
  goal: number;
  /** Lo que queda libre al mes. Puede ser negativo. */
  free: number;
  /** Solo si se cobra por quincena: lo libre de cada una. Suman `free`. */
  periods: { first: number; second: number } | null;
  state: EstimateState;
};

/** Parte un valor en dos mitades enteras que suman exactamente el valor. */
function halves(amount: number): [number, number] {
  const first = Math.floor(amount / 2);
  return [first, amount - first];
}

/**
 * Plata libre estimada del mes:
 * ingreso − gastos fijos − cuotas de deudas − cuotas de la tarjeta − aporte a la meta.
 */
export function estimateFreeMoney(input: EstimateInput): Estimate {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const payments = paymentsPerMonth(input.payFrequency);

  const fixedExpenses = sum(input.fixedExpenses.map((expense) => expense.amount));
  const debts = sum(input.debts.map((debt) => debt.installmentAmount));
  const card = sum(
    (input.card?.plans ?? []).map((plan) =>
      planMonthlyPayment(plan.principal, plan.installmentsCount),
    ),
  );
  const goal = input.goalPerPayment * payments;
  const free = input.monthlyIncome - fixedExpenses - debts - card - goal;

  let periods: Estimate["periods"] = null;
  if (input.payFrequency === "biweekly") {
    const [incomeFirst, incomeSecond] = halves(input.monthlyIncome);
    let first = incomeFirst - input.goalPerPayment;
    let second = incomeSecond - input.goalPerPayment;

    for (const expense of input.fixedExpenses) {
      if (expense.split === "first") first -= expense.amount;
      else if (expense.split === "second") second -= expense.amount;
      else {
        const [a, b] = halves(expense.amount);
        first -= a;
        second -= b;
      }
    }
    for (const debt of input.debts) {
      if (payPeriodForDay(debt.paymentDay, input.payDays) === "first") {
        first -= debt.installmentAmount;
      } else second -= debt.installmentAmount;
    }
    if (input.card) {
      if (payPeriodForDay(input.card.paymentDay, input.payDays) === "first") first -= card;
      else second -= card;
    }
    periods = { first, second };
  }

  return {
    income: input.monthlyIncome,
    fixedExpenses,
    debts,
    card,
    goal,
    free,
    periods,
    state: estimateState(free, input.monthlyIncome),
  };
}

/**
 * Cómo va el usuario según lo libre: mal si no le alcanza, regular si le queda menos
 * del 10 % del ingreso, bien en adelante.
 */
export function estimateState(free: number, monthlyIncome: number): EstimateState {
  if (free < 0) return "bad";
  if (free * 10 < monthlyIncome) return "regular";
  return "good";
}

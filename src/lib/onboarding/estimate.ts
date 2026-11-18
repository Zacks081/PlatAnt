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

export type CardPlan = {
  kind: "purchase" | "advance" | "subscription";
  principal: number;
  installmentsCount: number;
};

/**
 * Lo que se paga este mes por algo de la tarjeta. Es la próxima cuota, la más alta:
 * - plan mensual: su valor, sin intereses;
 * - compra o avance: el saldo repartido en las cuotas que faltan, más el interés del mes
 *   sobre lo que se debe. Una compra a una sola cuota no paga interés; un avance sí,
 *   desde el primer día.
 * Los bancos cobran el abono a capital fijo y el interés sobre el saldo, así que las
 * siguientes cuotas van bajando: esta es una estimación prudente.
 */
export function planMonthlyPayment(plan: CardPlan, monthlyRate: number): number {
  if (plan.kind === "subscription") return plan.principal;
  const installments = Math.max(1, plan.installmentsCount);
  const capital = Math.ceil(plan.principal / installments);
  const paysInterest = plan.kind === "advance" || installments > 1;
  const interest = paysInterest ? Math.round((plan.principal * monthlyRate) / 100) : 0;
  return capital + interest;
}

/**
 * Cuánto hay que apartar cada mes para llegar a la meta en su fecha.
 * Cuenta los meses que faltan hasta el mes de la meta; si ya es ese mes o pasó, toma uno.
 */
export function goalMonthlyContribution(input: {
  targetAmount: number;
  target: YearMonth;
  today: YearMonth;
}): number {
  const months = Math.max(1, monthsBetween(input.today, input.target));
  return Math.ceil(input.targetAmount / months);
}

/** Pagos que se reciben al mes. */
export const paymentsPerMonth = (frequency: PayFrequency) => (frequency === "biweekly" ? 2 : 1);

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
  /**
   * Cuotas de deudas. Con `split`, salen de la quincena elegida; sin él (un pago único),
   * del último pago recibido antes del día en que se paga.
   */
  debts: readonly { installmentAmount: number; paymentDay: number; split: ExpenseSplit | null }[];
  card: {
    split: ExpenseSplit;
    /** Tasa mensual en porcentaje (3 si no se conoce). */
    monthlyRate: number;
    plans: readonly CardPlan[];
  } | null;
  /** Aporte mensual a cada meta (ver goalMonthlyContribution) y de qué quincena sale. */
  goals: readonly { monthly: number; split: ExpenseSplit }[];
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

  const fixedExpenses = sum(input.fixedExpenses.map((expense) => expense.amount));
  const debts = sum(input.debts.map((debt) => debt.installmentAmount));
  const card = input.card
    ? sum(input.card.plans.map((plan) => planMonthlyPayment(plan, input.card!.monthlyRate)))
    : 0;
  const goal = sum(input.goals.map((item) => item.monthly));
  const free = input.monthlyIncome - fixedExpenses - debts - card - goal;

  let periods: Estimate["periods"] = null;
  if (input.payFrequency === "biweekly") {
    const [incomeFirst, incomeSecond] = halves(input.monthlyIncome);
    let first = incomeFirst;
    let second = incomeSecond;

    /** Descuenta un pago de la quincena que le toca, o la mitad de cada una. */
    const charge = (amount: number, split: ExpenseSplit) => {
      if (split === "first") first -= amount;
      else if (split === "second") second -= amount;
      else {
        const [a, b] = halves(amount);
        first -= a;
        second -= b;
      }
    };

    for (const expense of input.fixedExpenses) charge(expense.amount, expense.split);
    for (const debt of input.debts) {
      charge(debt.installmentAmount, debt.split ?? payPeriodForDay(debt.paymentDay, input.payDays));
    }
    if (input.card) charge(card, input.card.split);
    for (const item of input.goals) charge(item.monthly, item.split);
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
 * Porcentaje del ingreso que debe quedar libre cada mes, después de gastos fijos, cuotas,
 * tarjeta y aportes a metas. Lo libre paga el día a día (mercado, transporte) y los gustos.
 * Basado en la regla 50/30/20, que deja el 30 % del ingreso para gastos variables y gustos.
 * El límite está en 25 % para que quien siga esa regla quede en verde con margen.
 * - 25 % o más: bien.
 * - entre 15 % y 25 %: regular, queda poco para el día a día.
 * - menos de 15 %: mal, ni el mercado y el transporte del mes alcanzan con holgura.
 */
export const FREE_SHARE = { good: 25, regular: 15 } as const;

export function estimateState(free: number, monthlyIncome: number): EstimateState {
  if (free * 100 < FREE_SHARE.regular * monthlyIncome) return "bad";
  if (free * 100 < FREE_SHARE.good * monthlyIncome) return "regular";
  return "good";
}

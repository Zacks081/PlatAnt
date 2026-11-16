"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import {
  dayOptions,
  FieldCard,
  HeroMoney,
  MoneyRow,
  SegmentedRow,
  SelectRow,
  TextRow,
  type Option,
} from "@/components/forms/fields";
import { ItemList, Note, TotalLine } from "@/components/onboarding/screen";
import { Button } from "@/components/ui/button";
import { parseYearMonth, type YearMonth } from "@/lib/dates";
import { emptyFormState, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { goalContributionPerPayment, type PayFrequency } from "@/lib/onboarding/estimate";

/** Formularios del recorrido inicial. Los mismos sirven para editar desde Ajustes. */

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

/** Lo que el formulario muestra en un campo: lo último que se envió, o el valor guardado. */
function useForm(action: Action) {
  const [state, formAction, isPending] = useActionState(action, emptyFormState);
  const value = (name: string, saved: string | number | null | undefined = "") =>
    state.values?.[name] ?? (saved === null ? "" : String(saved));
  return { state, formAction, isPending, value, errors: state.errors ?? {} };
}

type ShellProps = {
  form: ReturnType<typeof useForm>;
  submitLabel: string;
  children: ReactNode;
};

/** El formulario con su botón principal pegado abajo y el mensaje de error general. */
function FormShell({ form, submitLabel, children }: ShellProps) {
  return (
    <form action={form.formAction} noValidate className="flex flex-1 flex-col gap-5">
      {children}
      <div className="mt-auto flex flex-col gap-3 pt-4">
        <p role="alert" className="px-1 text-sm text-gasto empty:hidden">
          {form.state.message}
        </p>
        <Button type="submit" size="lg" disabled={form.isPending} className="w-full">
          {form.isPending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// --- Paso 1: ingresos -------------------------------------------------------

type IncomeFormProps = {
  action: Action;
  submitLabel: string;
  initial: { monthlyIncome: number | null; payFrequency: PayFrequency; payDays: number[] };
};

export function IncomeForm({ action, submitLabel, initial }: IncomeFormProps) {
  const form = useForm(action);
  const [frequency, setFrequency] = useState<string>(
    form.value("payFrequency", initial.payFrequency),
  );
  const isBiweekly = frequency === "biweekly";

  // Días que se muestran: los de un envío con error o los guardados, pero solo si son de la
  // misma forma de pago que está elegida; al cambiarla, se proponen los habituales.
  const submitted = form.state.values;
  const days =
    submitted && submitted.payFrequency === frequency
      ? [submitted.payDay1, submitted.payDay2]
      : frequency === initial.payFrequency
        ? initial.payDays.map(String)
        : isBiweekly
          ? ["15", "30"]
          : ["30"];

  return (
    <FormShell form={form} submitLabel={submitLabel}>
      <HeroMoney
        name="monthlyIncome"
        label="Ingreso mensual"
        tone="libre"
        defaultValue={form.value("monthlyIncome", initial.monthlyIncome)}
        error={form.errors.monthlyIncome}
      />
      <FieldCard>
        <SegmentedRow
          name="payFrequency"
          label="Te pagan"
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: "biweekly", label: "Quincenal" },
            { value: "monthly", label: "Mensual" },
          ]}
        />
        {/* La «key» reinicia las listas al cambiar entre quincenal y mensual. */}
        <SelectRow
          key={`first-${frequency}`}
          name="payDay1"
          label={isBiweekly ? "Primer pago" : "Día de pago"}
          options={dayOptions("Día ")}
          defaultValue={days[0]}
          error={form.errors.payDay1}
        />
        {isBiweekly ? (
          <SelectRow
            key={`second-${frequency}`}
            name="payDay2"
            label="Segundo pago"
            options={dayOptions("Día ")}
            defaultValue={days[1] || "30"}
            error={form.errors.payDay2}
          />
        ) : (
          <input type="hidden" name="payDay2" value="" />
        )}
      </FieldCard>
      <Note>Si el día cae en fin de semana o festivo, la app lo corre al día hábil anterior.</Note>
    </FormShell>
  );
}

// --- Paso 2: saldos de hoy --------------------------------------------------

type BalancesFormProps = {
  action: Action;
  submitLabel: string;
  initial: { account: number; cash: number };
};

export function BalancesForm({ action, submitLabel, initial }: BalancesFormProps) {
  const form = useForm(action);
  const [account, setAccount] = useState<number>(initial.account);
  const [cash, setCash] = useState<number>(initial.cash);

  return (
    <FormShell form={form} submitLabel={submitLabel}>
      <FieldCard>
        <MoneyRow
          name="account"
          label="En la cuenta"
          defaultValue={initial.account || ""}
          onValueChange={(amount) => setAccount(amount ?? 0)}
          error={form.errors.account}
        />
        <MoneyRow
          name="cash"
          label="En efectivo"
          defaultValue={initial.cash || ""}
          onValueChange={(amount) => setCash(amount ?? 0)}
          error={form.errors.cash}
        />
      </FieldCard>
      <TotalLine label="Tienes en total" amount={formatMoney(account + cash)} />
      <Note>No tiene que ser exacto. Más adelante puedes cuadrar el saldo cuando quieras.</Note>
    </FormShell>
  );
}

// --- Paso 3: un gasto fijo --------------------------------------------------

type FixedExpenseFormProps = {
  action: Action;
  categories: Option[];
  /** Si se cobra por quincena, se pregunta de cuál sale. */
  askSplit: boolean;
  initial?: { amount: number; name: string; categoryId: string; dueDay: number; split: string };
};

export function FixedExpenseForm({ action, categories, askSplit, initial }: FixedExpenseFormProps) {
  const form = useForm(action);

  return (
    <FormShell form={form} submitLabel="Guardar">
      <HeroMoney
        name="amount"
        label="Valor mensual"
        tone="gasto"
        defaultValue={form.value("amount", initial?.amount)}
        error={form.errors.amount}
      />
      <FieldCard>
        <TextRow
          name="name"
          label="Nombre"
          placeholder="Arriendo, internet…"
          maxLength={60}
          defaultValue={form.value("name", initial?.name)}
          error={form.errors.name}
        />
        <SelectRow
          name="categoryId"
          label="Categoría"
          options={categories}
          placeholder="Elegir"
          defaultValue={form.value("categoryId", initial?.categoryId)}
          error={form.errors.categoryId}
        />
        <SelectRow
          name="dueDay"
          label="Día de pago"
          options={dayOptions()}
          defaultValue={form.value("dueDay", initial?.dueDay ?? 1)}
          error={form.errors.dueDay}
        />
        {askSplit ? (
          <SelectRow
            name="split"
            label="Sale de"
            options={[
              { value: "first", label: "Primera quincena" },
              { value: "second", label: "Segunda quincena" },
              { value: "half", label: "Mitad y mitad" },
            ]}
            defaultValue={form.value("split", initial?.split ?? "first")}
            error={form.errors.split}
          />
        ) : (
          <input type="hidden" name="split" value={initial?.split ?? "first"} />
        )}
      </FieldCard>
      {askSplit && (
        <Note>
          «Sale de» dice de cuál pago se aparta la plata: del primero, del segundo, o la mitad de
          cada uno.
        </Note>
      )}
    </FormShell>
  );
}

// --- Paso 4: tarjeta de crédito ---------------------------------------------

type CardFormProps = {
  action: Action;
  submitLabel: string;
  initial: { statementDay: number; paymentDay: number; monthlyRate: string; debt: number };
  plans: { href: string; name: string; detail: string; amount: string }[];
  /** Explicación de lo que no está en cuotas; la calcula el servidor con lo guardado. */
  remainderNote: string | null;
};

export function CardForm({ action, submitLabel, initial, plans, remainderNote }: CardFormProps) {
  const form = useForm(action);

  return (
    <FormShell form={form} submitLabel={submitLabel}>
      <FieldCard>
        <SelectRow
          name="statementDay"
          label="Día de corte"
          options={dayOptions()}
          defaultValue={form.value("statementDay", initial.statementDay)}
          error={form.errors.statementDay}
        />
        <SelectRow
          name="paymentDay"
          label="Día de pago"
          options={dayOptions()}
          defaultValue={form.value("paymentDay", initial.paymentDay)}
          error={form.errors.paymentDay}
        />
        <TextRow
          name="monthlyRate"
          label="Interés mensual"
          placeholder="Opcional"
          inputMode="decimal"
          maxLength={5}
          suffix="%"
          defaultValue={form.value("monthlyRate", initial.monthlyRate)}
          error={form.errors.monthlyRate}
        />
        <MoneyRow
          name="debt"
          label="Debes hoy"
          defaultValue={form.value("debt", initial.debt || "")}
          error={form.errors.debt}
        />
      </FieldCard>

      <section className="flex flex-col gap-2.5">
        <h2 className="px-1 font-display text-lg font-semibold">Cuotas en curso</h2>
        <ItemList items={plans} />
        {/* Guarda la tarjeta y abre el formulario de la cuota. */}
        <Button
          type="submit"
          name="intent"
          value="add-plan"
          variant="outline"
          disabled={form.isPending}
          className="h-12 w-full"
        >
          <Plus aria-hidden="true" className="size-[18px]" />
          Agregar cuota en curso
        </Button>
      </section>

      <Note>
        {remainderNote} Si no escribes el interés, usamos 3 % y lo marcamos como estimado.
      </Note>
    </FormShell>
  );
}

type PlanFormProps = {
  action: Action;
  initial?: { principal: number; name: string; kind: string; installmentsCount: number };
};

export function PlanForm({ action, initial }: PlanFormProps) {
  const form = useForm(action);
  const [kind, setKind] = useState<string>(form.value("kind", initial?.kind ?? "purchase"));

  return (
    <FormShell form={form} submitLabel="Guardar">
      <HeroMoney
        name="principal"
        label="Lo que falta por pagar"
        tone="gasto"
        defaultValue={form.value("principal", initial?.principal)}
        error={form.errors.principal}
      />
      <FieldCard>
        <TextRow
          name="name"
          label="Nombre"
          placeholder="Celular, avance…"
          maxLength={60}
          defaultValue={form.value("name", initial?.name)}
          error={form.errors.name}
        />
        <SegmentedRow
          name="kind"
          label="Fue"
          value={kind}
          onChange={setKind}
          options={[
            { value: "purchase", label: "Compra" },
            { value: "advance", label: "Avance" },
          ]}
        />
        <TextRow
          name="installmentsCount"
          label="Cuotas que faltan"
          placeholder="0"
          inputMode="numeric"
          maxLength={3}
          defaultValue={form.value("installmentsCount", initial?.installmentsCount)}
          error={form.errors.installmentsCount}
        />
      </FieldCard>
      <Note>Arriba va lo que todavía debes de esta compra o avance, no su valor original.</Note>
    </FormShell>
  );
}

// --- Paso 5: una deuda ------------------------------------------------------

type DebtFormProps = {
  action: Action;
  initial?: {
    originalAmount: number;
    name: string;
    installmentAmount: number;
    paymentDay: number;
    installmentsRemaining: number;
  };
};

export function DebtForm({ action, initial }: DebtFormProps) {
  const form = useForm(action);

  return (
    <FormShell form={form} submitLabel="Guardar">
      <HeroMoney
        name="originalAmount"
        label="Lo que debes hoy"
        tone="gasto"
        defaultValue={form.value("originalAmount", initial?.originalAmount)}
        error={form.errors.originalAmount}
      />
      <FieldCard>
        <TextRow
          name="name"
          label="Nombre"
          placeholder="Préstamo, moto…"
          maxLength={60}
          defaultValue={form.value("name", initial?.name)}
          error={form.errors.name}
        />
        <MoneyRow
          name="installmentAmount"
          label="Cuota mensual"
          defaultValue={form.value("installmentAmount", initial?.installmentAmount)}
          error={form.errors.installmentAmount}
        />
        <SelectRow
          name="paymentDay"
          label="Día de pago"
          options={dayOptions()}
          defaultValue={form.value("paymentDay", initial?.paymentDay ?? 30)}
          error={form.errors.paymentDay}
        />
        <TextRow
          name="installmentsRemaining"
          label="Cuotas que faltan"
          placeholder="0"
          inputMode="numeric"
          maxLength={3}
          defaultValue={form.value("installmentsRemaining", initial?.installmentsRemaining)}
          error={form.errors.installmentsRemaining}
        />
      </FieldCard>
    </FormShell>
  );
}

// --- Paso 6: meta -----------------------------------------------------------

type GoalFormProps = {
  action: Action;
  submitLabel: string;
  monthOptions: Option[];
  today: YearMonth;
  payFrequency: PayFrequency;
  initial?: { targetAmount: number; name: string; targetMonth: string };
};

export function GoalForm({
  action,
  submitLabel,
  monthOptions,
  today,
  payFrequency,
  initial,
}: GoalFormProps) {
  const form = useForm(action);
  const [amount, setAmount] = useState<number | null>(initial?.targetAmount ?? null);
  const [month, setMonth] = useState<string>(form.value("targetMonth", initial?.targetMonth));

  const target = parseYearMonth(month);
  const perPayment =
    amount && target
      ? goalContributionPerPayment({ targetAmount: amount, target, today, payFrequency })
      : null;

  return (
    <FormShell form={form} submitLabel={submitLabel}>
      <HeroMoney
        name="targetAmount"
        label="Valor de la meta"
        tone="libre"
        defaultValue={form.value("targetAmount", initial?.targetAmount)}
        onValueChange={setAmount}
        error={form.errors.targetAmount}
      />
      <FieldCard>
        <TextRow
          name="name"
          label="Nombre"
          placeholder="Viaje, moto, colchón…"
          maxLength={60}
          defaultValue={form.value("name", initial?.name)}
          error={form.errors.name}
        />
        <SelectRow
          name="targetMonth"
          label="Para cuándo"
          options={monthOptions}
          placeholder="Elegir"
          defaultValue={month}
          onValueChange={setMonth}
          error={form.errors.targetMonth}
        />
      </FieldCard>
      {perPayment !== null && (
        <TotalLine
          label={payFrequency === "biweekly" ? "Serían por quincena" : "Serían al mes"}
          amount={formatMoney(perPayment)}
        />
      )}
    </FormShell>
  );
}

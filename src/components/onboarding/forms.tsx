"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import {
  DateRow,
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
import { parseIsoDate, type CalendarDate } from "@/lib/dates";
import { emptyFormState, type FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { goalMonthlyContribution, type PayFrequency } from "@/lib/onboarding/estimate";
import { cn } from "@/lib/utils";

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

const SPLIT_OPTIONS = [
  { value: "first", label: "Primera quincena" },
  { value: "second", label: "Segunda quincena" },
  { value: "half", label: "Mitad y mitad" },
];

/** «Sale de»: de cuál pago se aparta la plata. Si se cobra una vez al mes, no se pregunta. */
function SplitField({
  form,
  ask,
  saved,
}: {
  form: ReturnType<typeof useForm>;
  ask: boolean;
  saved: string | undefined;
}) {
  if (!ask) return <input type="hidden" name="split" value={saved ?? "half"} />;
  return (
    <SelectRow
      name="split"
      label="Sale de"
      options={SPLIT_OPTIONS}
      defaultValue={form.value("split", saved ?? "half")}
      error={form.errors.split}
    />
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
          layout="grid"
          defaultValue={days[0]}
          error={form.errors.payDay1}
        />
        {isBiweekly ? (
          <SelectRow
            key={`second-${frequency}`}
            name="payDay2"
            label="Segundo pago"
            options={dayOptions("Día ")}
            layout="grid"
            defaultValue={days[1] || "30"}
            error={form.errors.payDay2}
          />
        ) : (
          <input type="hidden" name="payDay2" value="" />
        )}
      </FieldCard>
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
      <Note>No tiene que ser exacto. Después puedes corregirlo cuando quieras.</Note>
    </FormShell>
  );
}

// --- Paso 3: un gasto fijo --------------------------------------------------

type FixedExpenseFormProps = {
  action: Action;
  categories: Option[];
  /** La categoría «Otros»: al elegirla se puede escribir una categoría nueva. */
  otherCategoryId: string | null;
  /** Si se cobra por quincena, se pregunta de cuál sale. */
  askSplit: boolean;
  initial?: { amount: number; name: string; categoryId: string; dueDay: number; split: string };
};

export function FixedExpenseForm({
  action,
  categories,
  otherCategoryId,
  askSplit,
  initial,
}: FixedExpenseFormProps) {
  const form = useForm(action);
  const [categoryId, setCategoryId] = useState(form.value("categoryId", initial?.categoryId));

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
          defaultValue={categoryId}
          onValueChange={setCategoryId}
          error={form.errors.categoryId}
        />
        {otherCategoryId !== null && categoryId === otherCategoryId ? (
          <TextRow
            name="newCategory"
            label="Nombre de la categoría"
            placeholder="Mascotas, regalos…"
            maxLength={40}
            defaultValue={form.value("newCategory")}
            error={form.errors.newCategory}
          />
        ) : (
          <input type="hidden" name="newCategory" value="" />
        )}
        <SelectRow
          name="dueDay"
          label="Día de pago"
          options={dayOptions("Día ")}
          layout="grid"
          defaultValue={form.value("dueDay", initial?.dueDay ?? 30)}
          error={form.errors.dueDay}
        />
        <SplitField form={form} ask={askSplit} saved={initial?.split} />
      </FieldCard>
      {askSplit && (
        <Note>
          Como te pagan dos veces al mes, dinos con cuál de los dos pagos cubres este gasto. Si lo
          cubres con los dos, elige «Mitad y mitad».
        </Note>
      )}
    </FormShell>
  );
}

// --- Paso 4: tarjeta de crédito ---------------------------------------------

type CardFormProps = {
  action: Action;
  submitLabel: string;
  initial: { statementDay: number; paymentDay: number; monthlyRate: string; split: string };
  /** Si se cobra por quincena, se pregunta de cuál sale el pago. */
  askSplit: boolean;
  plans: { href: string; name: string; detail: string; amount: string }[];
  /** Lo que se debe en total, ya con formato; `null` si todavía no hay nada. */
  debtTotal: string | null;
};

export function CardForm({
  action,
  submitLabel,
  initial,
  askSplit,
  plans,
  debtTotal,
}: CardFormProps) {
  const form = useForm(action);

  return (
    <FormShell form={form} submitLabel={submitLabel}>
      <FieldCard>
        <SelectRow
          name="statementDay"
          label="Día de corte"
          options={dayOptions("Día ")}
          layout="grid"
          defaultValue={form.value("statementDay", initial.statementDay)}
          error={form.errors.statementDay}
        />
        <SelectRow
          name="paymentDay"
          label="Día de pago"
          options={dayOptions("Día ")}
          layout="grid"
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
        <SplitField form={form} ask={askSplit} saved={initial.split} />
      </FieldCard>

      <section className="flex flex-col gap-2.5">
        <h2 className="px-1 font-display text-lg font-semibold">Lo que debes en la tarjeta</h2>
        <ItemList items={plans} />
        {/* Guarda la tarjeta y abre el formulario para agregar. */}
        <Button
          type="submit"
          name="intent"
          value="add-plan"
          variant="outline"
          disabled={form.isPending}
          className="h-12 w-full"
        >
          <Plus aria-hidden="true" className="size-[18px]" />
          Agregar compra, avance o plan
        </Button>
      </section>

      {debtTotal && <TotalLine label="Debes en total" amount={debtTotal} />}
      <Note>
        A cada cuota le sumamos el interés del mes. Si no sabes cuánto te cobran, déjalo vacío y
        usamos 3 %.
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
  const isSubscription = kind === "subscription";

  return (
    <FormShell form={form} submitLabel="Guardar">
      <HeroMoney
        name="principal"
        label={isSubscription ? "Valor mensual" : "Lo que falta por pagar"}
        tone="gasto"
        defaultValue={form.value("principal", initial?.principal)}
        error={form.errors.principal}
      />
      <FieldCard>
        <TextRow
          name="name"
          label="Nombre"
          placeholder={isSubscription ? "Música, plan de datos…" : "Celular, avance…"}
          maxLength={60}
          defaultValue={form.value("name", initial?.name)}
          error={form.errors.name}
        />
        <SelectRow
          name="kind"
          label="Fue"
          options={[
            { value: "purchase", label: "Compra" },
            { value: "advance", label: "Avance" },
            { value: "subscription", label: "Plan mensual" },
          ]}
          defaultValue={kind}
          onValueChange={setKind}
          error={form.errors.kind}
        />
        {isSubscription ? (
          <input type="hidden" name="installmentsCount" value="" />
        ) : (
          <TextRow
            name="installmentsCount"
            label="Cuotas que faltan"
            placeholder="0"
            inputMode="numeric"
            maxLength={3}
            defaultValue={form.value("installmentsCount", initial?.installmentsCount)}
            error={form.errors.installmentsCount}
          />
        )}
      </FieldCard>
      <Note>
        {isSubscription
          ? "Un plan mensual es algo que la tarjeta te cobra todos los meses, como una aplicación o el plan del celular."
          : "Arriba va lo que todavía debes, no lo que costó. Si lo pagas de una sola vez, pon 1 cuota."}
      </Note>
    </FormShell>
  );
}

// --- Paso 5: una deuda ------------------------------------------------------

type DebtFormProps = {
  action: Action;
  today: CalendarDate;
  /** Si se cobra por quincena, se pregunta de cuál sale la cuota. */
  askSplit: boolean;
  initial?: {
    originalAmount: number;
    name: string;
    paymentType: string;
    dueDate: string | null;
    installmentAmount: number;
    paymentDay: number;
    installmentsRemaining: number;
    split: string;
  };
};

export function DebtForm({ action, today, askSplit, initial }: DebtFormProps) {
  const form = useForm(action);
  const [paymentType, setPaymentType] = useState<string>(
    form.value("paymentType", initial?.paymentType ?? "monthly"),
  );
  const isSingle = paymentType === "single";
  // Los datos de la mensualidad solo se muestran si la deuda guardada era de mensualidad.
  const monthly = initial?.paymentType === "monthly" ? initial : undefined;

  return (
    <FormShell form={form} submitLabel="Guardar">
      <HeroMoney
        name="originalAmount"
        label="Total que debes"
        tone="gasto"
        defaultValue={form.value("originalAmount", initial?.originalAmount)}
        error={form.errors.originalAmount}
      />
      <FieldCard>
        <TextRow
          name="name"
          label="Nombre"
          placeholder="Préstamo, crédito del banco…"
          maxLength={60}
          defaultValue={form.value("name", initial?.name)}
          error={form.errors.name}
        />
        <SegmentedRow
          name="paymentType"
          label="La pagas"
          value={paymentType}
          onChange={setPaymentType}
          options={[
            { value: "single", label: "De una vez" },
            { value: "monthly", label: "Por cuotas" },
          ]}
        />
        {isSingle ? (
          <>
            <DateRow
              name="dueDate"
              label="Fecha de pago"
              min={today}
              max={{ year: today.year + 10, month: 12, day: 31 }}
              defaultValue={form.value("dueDate", initial?.dueDate)}
              error={form.errors.dueDate}
            />
            <input type="hidden" name="installmentAmount" value="" />
            <input type="hidden" name="paymentDay" value="" />
            <input type="hidden" name="installmentsRemaining" value="" />
            <input type="hidden" name="split" value="half" />
          </>
        ) : (
          <>
            <MoneyRow
              name="installmentAmount"
              label="Cuota mensual"
              defaultValue={form.value("installmentAmount", monthly?.installmentAmount)}
              error={form.errors.installmentAmount}
            />
            <TextRow
              name="installmentsRemaining"
              label="Cuotas que faltan"
              placeholder="0"
              inputMode="numeric"
              maxLength={3}
              defaultValue={form.value("installmentsRemaining", monthly?.installmentsRemaining)}
              error={form.errors.installmentsRemaining}
            />
            <SelectRow
              name="paymentDay"
              label="Día de pago"
              options={dayOptions("Día ")}
              layout="grid"
              defaultValue={form.value("paymentDay", monthly?.paymentDay ?? 30)}
              error={form.errors.paymentDay}
            />
            <SplitField form={form} ask={askSplit} saved={monthly?.split} />
            <input type="hidden" name="dueDate" value="" />
          </>
        )}
      </FieldCard>
    </FormShell>
  );
}

// --- Paso 6: una meta -------------------------------------------------------

type GoalFormProps = {
  action: Action;
  today: CalendarDate;
  payFrequency: PayFrequency;
  initial?: { targetAmount: number; name: string; targetDate: string; split: string };
};

export function GoalForm({ action, today, payFrequency, initial }: GoalFormProps) {
  const form = useForm(action);
  const [amount, setAmount] = useState<number | null>(initial?.targetAmount ?? null);
  const [date, setDate] = useState<string>(form.value("targetDate", initial?.targetDate));
  const [split, setSplit] = useState<string>(form.value("split", initial?.split ?? "half"));

  const target = parseIsoDate(date);
  // Con el valor y la fecha ya se sabe cuánto apartar al mes.
  const monthly =
    amount && target ? goalMonthlyContribution({ targetAmount: amount, target, today }) : null;
  const askSplit = payFrequency === "biweekly";

  return (
    <FormShell form={form} submitLabel="Guardar">
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
        <DateRow
          name="targetDate"
          label="Para cuándo"
          min={today}
          max={{ year: today.year + 10, month: 12, day: 31 }}
          defaultValue={date}
          onValueChange={setDate}
          error={form.errors.targetDate}
        />
      </FieldCard>

      <input type="hidden" name="split" value={askSplit ? split : "half"} />
      {monthly !== null && (
        <section className="flex flex-col gap-3.5 rounded-[24px] bg-card p-5">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Al mes serían</span>
            <span className="font-display text-[22px] font-bold tracking-[-0.02em] tabular-nums">
              {formatMoney(monthly)}
            </span>
          </p>
          {askSplit && (
            <div className="flex flex-col gap-2.5 border-t border-border pt-3.5">
              <p id="goal-split-label" className="text-muted-foreground">
                Este ahorro quieres sacarlo de:
              </p>
              <div
                role="radiogroup"
                aria-labelledby="goal-split-label"
                className="flex flex-wrap gap-2"
              >
                {SPLIT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={split === option.value}
                    onClick={() => setSplit(option.value)}
                    className={cn(
                      "flex h-10 items-center rounded-full px-4 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      split === option.value
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {form.errors.split && <p className="text-[13px] text-gasto">{form.errors.split}</p>}
            </div>
          )}
        </section>
      )}
    </FormShell>
  );
}

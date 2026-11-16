import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { BackLink, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { requireOnboardedUser } from "@/lib/auth/session";
import {
  getCard,
  getDebts,
  getFixedExpenses,
  getGoal,
  yearMonthOfDate,
} from "@/lib/onboarding/data";
import { monthLabel } from "@/lib/onboarding/labels";
import { stepPath, type StepNumber } from "@/lib/onboarding/steps";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "../(auth)/actions";

export const metadata: Metadata = { title: "Ajustes" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Settings />
    </Suspense>
  );
}

const rowClass = "flex min-h-14 items-center justify-between gap-3";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 font-display text-lg font-semibold">{title}</h2>
      <div className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
        {children}
      </div>
    </section>
  );
}

function StepLink({ step, label, value }: { step: StepNumber; label: string; value: string }) {
  return (
    <Link
      href={stepPath(step)}
      className={`${rowClass} rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
    >
      <span>{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <span className="truncate">{value}</span>
        <ChevronRight aria-hidden="true" className="size-[18px] shrink-0" />
      </span>
    </Link>
  );
}

async function Settings() {
  const user = await requireOnboardedUser();
  const db = await createClient();
  const [fixedExpenses, card, debts, goal] = await Promise.all([
    getFixedExpenses(db),
    getCard(db),
    getDebts(db),
    getGoal(db),
  ]);
  const count = (items: unknown[]) => (items.length > 0 ? String(items.length) : "Ninguno");

  return (
    <Screen>
      <header className="flex min-h-11 items-center gap-3">
        <BackLink href="/" label="Volver al inicio" />
        <h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">Ajustes</h1>
      </header>

      <Group title="Tu plata">
        <StepLink
          step={1}
          label="Ingresos y días de pago"
          value={user.payFrequency === "biweekly" ? "Quincenal" : "Mensual"}
        />
        <StepLink step={2} label="Saldos iniciales" value="Cuenta y efectivo" />
        <StepLink step={3} label="Gastos fijos" value={count(fixedExpenses)} />
        <StepLink
          step={4}
          label="Tarjeta de crédito"
          value={card ? `Corte el ${card.statement_day}` : "Sin registrar"}
        />
        <StepLink
          step={5}
          label="Deudas"
          value={debts.length > 0 ? String(debts.length) : "Ninguna"}
        />
        <StepLink
          step={6}
          label="Meta"
          value={goal ? monthLabel(yearMonthOfDate(goal.target_date)) : "Sin meta"}
        />
      </Group>

      <Group title="Tu cuenta">
        <div className={rowClass}>
          <span>Nombre de usuario</span>
          <span className="truncate text-muted-foreground">{user.name}</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className={`${rowClass} w-full rounded-lg text-left font-semibold text-gasto outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
          >
            Cerrar sesión
          </button>
        </form>
      </Group>
    </Screen>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { PaydayForm } from "@/components/pay-periods/payday-form";
import { addDays, formatIsoDate, parseIsoDate, todayInTimeZone } from "@/lib/dates";
import { onDayLabel } from "@/lib/movements/format";
import { getMovement, openApp } from "@/lib/movements/data";
import { safeReturnPath } from "@/lib/movements/validation";
import { paymentsPerMonth } from "@/lib/onboarding/estimate";
import { getCurrentPeriod } from "@/lib/pay-periods/data";
import { instanceFromRow } from "@/lib/pay-periods/schedule";
import { inDaysLabel, nextPayStatus, PERIOD_WORDS } from "@/lib/pay-periods/summary";

import { registerPay } from "../(app)/quincena/actions";

export const metadata: Metadata = { title: "Me pagaron" };

type Props = Pick<PageProps<"/me-pagaron">, "searchParams">;

export default function PaydayPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Payday searchParams={searchParams} />
    </Suspense>
  );
}

async function Payday({ searchParams }: Props) {
  const back = safeReturnPath([(await searchParams).volver].flat()[0]);
  const { user, db } = await openApp();
  const last = await getCurrentPeriod(db);
  const today = todayInTimeZone(user.timeZone);

  // El siguiente pago se registra solo cuando ya está cerca: así no se abren quincenas futuras.
  const status = last ? nextPayStatus(today, parseIsoDate(last.expected_end_on)!) : null;
  if (status && !status.open) {
    return (
      <Screen>
        <ItemHeader backHref={back} title="Me pagaron" />
        <section className="flex flex-col gap-2 rounded-[28px] bg-card p-5">
          <p className="font-display text-xl font-semibold">Todavía no es tu próximo pago</p>
          <p className="text-muted-foreground">
            Te pagan {onDayLabel(last!.expected_end_on, today)}, {inDaysLabel(status.days)}. Podrás
            registrarlo desde {onDayLabel(formatIsoDate(status.opensOn), today)}.
          </p>
        </section>
      </Screen>
    );
  }

  // Se propone el mismo bolsillo del pago anterior: casi siempre llega igual.
  const lastMovement = last?.movement_id ? await getMovement(db, last.movement_id) : null;
  const pocket = lastMovement?.pockets?.kind === "cash" ? "cash" : "account";

  // Para registrar en segundos se propone lo que llegó la vez pasada (o el ingreso promedio
  // repartido entre los pagos del mes), pero manda lo que se escriba: el valor real.
  const suggested =
    last?.amount_received ??
    (user.monthlyIncome
      ? Math.round(user.monthlyIncome / paymentsPerMonth(user.payFrequency))
      : undefined);

  return (
    <Screen>
      <ItemHeader backHref={back} title="Me pagaron" />
      <PaydayForm
        action={registerPay}
        today={today}
        // Un pago de hasta dos meses atrás, por si se registra tarde.
        minDate={addDays(today, -62)}
        initial={{ amount: suggested, date: formatIsoDate(today), pocket }}
        note={`Abre ${PERIOD_WORDS[user.payFrequency].next}: la app pasa a cada bolsillo lo de tus gastos fijos y lo demás queda libre.`}
        autoFocus
        pay={{
          choose: { last: last ? instanceFromRow(last) : null, payDays: user.payDays },
        }}
      />
    </Screen>
  );
}

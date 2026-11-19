import type { Metadata } from "next";
import { Suspense } from "react";

import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { PaydayForm } from "@/components/pay-periods/payday-form";
import { addDays, formatIsoDate, todayInTimeZone } from "@/lib/dates";
import { openApp } from "@/lib/movements/data";
import { safeReturnPath } from "@/lib/movements/validation";
import { paymentsPerMonth } from "@/lib/onboarding/estimate";
import { getCurrentPeriod } from "@/lib/pay-periods/data";
import { PERIOD_WORDS } from "@/lib/pay-periods/summary";

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
        initial={{ amount: suggested, date: formatIsoDate(today) }}
        note={`Entra a tu cuenta y abre ${PERIOD_WORDS[user.payFrequency].next}: la app aparta lo de tus gastos fijos y lo demás queda libre.`}
        autoFocus
      />
    </Screen>
  );
}

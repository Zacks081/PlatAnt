import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { PocketMoveForm, PocketPayForm } from "@/components/pockets/pocket-forms";
import { buttonVariants } from "@/components/ui/button";
import { addDays, formatIsoDate, todayInTimeZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { openApp } from "@/lib/movements/data";
import { onDayLabel } from "@/lib/movements/format";
import {
  fixedPocketPath,
  pocketActionFromSlug,
  pocketDue,
  pocketProgress,
} from "@/lib/pockets/fixed";
import { getFixedPocket } from "@/lib/pockets/fixed-data";
import { cn } from "@/lib/utils";

import { movePocketMoney, payFromPocket } from "../../actions";

export const metadata: Metadata = { title: "Bolsillo" };

type Props = Pick<PageProps<"/bolsillos/[id]/[accion]">, "params">;

/** Apartar, sacar o pagar desde el bolsillo de un gasto fijo. */
export default function PocketActionPage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <PocketAction params={params} />
    </Suspense>
  );
}

async function PocketAction({ params }: Props) {
  const { id, accion } = await params;
  const action = pocketActionFromSlug(accion);
  if (!action || !z.uuid().safeParse(id).success) notFound();

  const { user, db } = await openApp();
  const pocket = await getFixedPocket(db, id);
  if (!pocket) notFound();

  const today = todayInTimeZone(user.timeZone);
  const common = {
    today,
    // Hasta dos meses atrás, por si se registra tarde.
    minDate: addDays(today, -62),
    pocketName: pocket.fixed.name,
  };
  const back = fixedPocketPath(id);

  if (action === "pay") {
    // Un pago por mes: si ya se pagó este mes, no se vuelve a pagar.
    const lastPayment = pocket.movements.find((movement) => movement.kind === "expense");
    const due = pocketDue(today, pocket.fixed.due_day, {
      unpaidDueOn: pocket.nextDueOn,
      lastPaymentOn: lastPayment?.occurred_on ?? null,
    });
    if (due.paidThisMonth && lastPayment) {
      return (
        <Screen>
          <ItemHeader backHref={back} title={`Pagar ${pocket.fixed.name}`} />
          <section className="flex flex-col gap-2 rounded-[28px] bg-card p-5">
            <p className="flex items-center gap-2 font-display text-xl font-semibold">
              <Check aria-hidden="true" className="size-5 text-libre" />
              Ya está pagado este mes
            </p>
            <p className="text-muted-foreground">
              Pagaste {pocket.fixed.name} {onDayLabel(lastPayment.occurred_on, today)} por{" "}
              {formatMoney(lastPayment.amount, { currency: user.currency })}. El próximo vence{" "}
              {onDayLabel(due.dueOn, today)}.
            </p>
          </section>
          <Link
            href={back}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
          >
            Volver al bolsillo
          </Link>
        </Screen>
      );
    }
    return (
      <Screen>
        <ItemHeader backHref={back} title={`Pagar ${pocket.fixed.name}`} />
        <PocketPayForm
          {...common}
          action={payFromPocket.bind(null, id)}
          initial={{ amount: pocket.fixed.amount, date: formatIsoDate(today) }}
          recordedAs={`Pago ${pocket.fixed.name}`}
        />
      </Screen>
    );
  }

  const into = action === "in";
  // Al apartar se propone lo que falta para completar el gasto.
  const missing = pocketProgress(pocket.balance, pocket.fixed.amount).missing;
  return (
    <Screen>
      <ItemHeader backHref={back} title={into ? "Apartar" : "Sacar"} />
      <PocketMoveForm
        {...common}
        action={movePocketMoney.bind(null, id, into)}
        initial={{ amount: into && missing > 0 ? missing : undefined, date: formatIsoDate(today) }}
        into={into}
      />
    </Screen>
  );
}

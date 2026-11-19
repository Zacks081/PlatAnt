import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ConfirmDelete } from "@/components/movements/confirm-delete";
import { MovementForm, TransferForm } from "@/components/movements/movement-form";
import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { PaydayForm } from "@/components/pay-periods/payday-form";
import { formatMoney } from "@/lib/money";
import { getMovement, getTransferFee, openApp } from "@/lib/movements/data";
import { dayLabel, POCKET_LABELS } from "@/lib/movements/format";
import { movementFormData } from "@/lib/movements/form-data";
import { safeReturnPath } from "@/lib/movements/validation";
import { getRecentPeriods } from "@/lib/pay-periods/data";
import { reconciliationLabel } from "@/lib/pockets/pockets";
import { addDays, todayInTimeZone } from "@/lib/dates";

import { deletePay, updatePay } from "../../(app)/quincena/actions";
import { deleteMovement, saveMovement, saveTransfer } from "../../movimientos/actions";

export const metadata: Metadata = { title: "Movimiento" };

type Props = Pick<PageProps<"/movimiento/[id]">, "params" | "searchParams">;

export default function MovementPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Movement params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Movement({ params, searchParams }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const back = safeReturnPath([(await searchParams).volver].flat()[0] ?? "/movimientos");

  const { user, db } = await openApp();
  const movement = await getMovement(db, id);
  if (!movement) notFound();

  if (movement.kind === "transfer") {
    const direction = movement.pockets?.kind === "account" ? "withdrawal" : "deposit";
    const [form, fee] = await Promise.all([
      movementFormData(db, user, "expense"),
      direction === "withdrawal" ? getTransferFee(db, movement.id) : null,
    ]);
    const noun = direction === "withdrawal" ? "retiro" : "consignación";
    return (
      <Screen>
        <ItemHeader
          backHref={back}
          title={direction === "withdrawal" ? "Retiro" : "Consignación"}
          action={
            <ConfirmDelete
              action={deleteMovement.bind(null, movement.id, back)}
              title={
                direction === "withdrawal" ? "¿Borrar este retiro?" : "¿Borrar esta consignación?"
              }
              description={`Se quita del historial y la plata vuelve a como estaba antes de ${direction === "withdrawal" ? "este" : "esta"} ${noun}${fee ? ", también su costo" : ""}. No se puede deshacer.`}
            />
          }
        />
        <TransferForm
          action={saveTransfer.bind(null, direction, movement.id, back)}
          direction={direction}
          today={form.today}
          minDate={form.minDate}
          initial={{
            amount: movement.amount,
            date: movement.occurred_on,
            description: movement.description ?? undefined,
            fee,
          }}
          autoFocus={false}
        />
      </Screen>
    );
  }

  // Un pago de «Me pagaron»: se corrige con su propio formulario, porque abrió una quincena.
  // Solo el último: los anteriores ya son historia.
  if (movement.origin === "payday") {
    const [latest] = await getRecentPeriods(db, 1);
    const today = todayInTimeZone(user.timeZone);
    if (latest?.movement_id === movement.id) {
      return (
        <Screen>
          <ItemHeader
            backHref={back}
            title="Me pagaron"
            action={
              <ConfirmDelete
                action={deletePay.bind(null, latest.id, back)}
                title="¿Borrar este pago?"
                description="Se quita el ingreso de tu cuenta y se cierra la quincena que abrió, con sus apartados. No se puede deshacer."
              />
            }
          />
          <PaydayForm
            action={updatePay.bind(null, latest.id, back)}
            today={today}
            minDate={addDays(today, -62)}
            initial={{ amount: movement.amount, date: movement.occurred_on }}
            note="Si cambias el valor o la fecha, los apartados de la quincena se ajustan solos."
            autoFocus={false}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <ItemHeader backHref={back} title="Me pagaron" />
        <dl className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
          {[
            ["Valor", formatMoney(movement.amount, { currency: user.currency })],
            ["Bolsillo", "Cuenta"],
            ["Fecha", dayLabel(movement.occurred_on, today)],
          ].map(([term, detail]) => (
            <div key={term} className="flex min-h-14 items-center justify-between gap-3">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-semibold tabular-nums">{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="px-1 text-[13px] text-muted-foreground">
          Este pago abrió una quincena que ya terminó. Solo se puede corregir el último pago.
        </p>
      </Screen>
    );
  }

  // Lo que registró un cuadre no se edita: si estuvo mal, se borra y se cuadra de nuevo.
  if (movement.origin === "reconciliation") {
    const label = reconciliationLabel(movement.kind);
    const pocket = POCKET_LABELS[movement.pockets?.kind ?? ""] ?? "";
    const rows = [
      ["Valor", formatMoney(movement.amount, { currency: user.currency })],
      ["Bolsillo", pocket],
      ["Fecha", dayLabel(movement.occurred_on, todayInTimeZone(user.timeZone))],
    ];
    return (
      <Screen>
        <ItemHeader
          backHref={back}
          title={label}
          action={
            <ConfirmDelete
              action={deleteMovement.bind(null, movement.id, back)}
              title={`¿Borrar este ${label.toLowerCase()}?`}
              description={`${pocket} vuelve al saldo que tenía antes del cuadre. No se puede deshacer.`}
            />
          }
        />
        <dl className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
          {rows.map(([term, detail]) => (
            <div key={term} className="flex min-h-14 items-center justify-between gap-3">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-semibold tabular-nums">{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="px-1 text-[13px] text-muted-foreground">
          {movement.kind === "expense"
            ? "Lo registró el cuadre de saldo: tenías menos plata de la que la app calculaba."
            : "Lo registró el cuadre de saldo: tenías más plata de la que la app calculaba."}{" "}
          No se edita; si estuvo mal, bórralo y vuelve a cuadrar.
        </p>
      </Screen>
    );
  }

  const kind = movement.kind;
  const form = await movementFormData(db, user, kind, movement.category_id);
  const noun = kind === "expense" ? "gasto" : "ingreso";

  return (
    <Screen>
      <ItemHeader
        backHref={back}
        title={kind === "expense" ? "Gasto" : "Ingreso"}
        action={
          <ConfirmDelete
            action={deleteMovement.bind(null, movement.id, back)}
            title={`¿Borrar este ${noun}?`}
            description="Se quita del historial y de tus saldos. No se puede deshacer."
          />
        }
      />
      <MovementForm
        action={saveMovement.bind(null, kind, movement.id, back)}
        kind={kind}
        categories={form.categories}
        otherCategoryId={form.otherCategoryId}
        pockets={form.pockets}
        cardPocketId={form.cardPocketId}
        today={form.today}
        minDate={form.minDate}
        initial={{
          amount: movement.amount,
          categoryId: movement.category_id ?? undefined,
          pocketId: movement.pocket_id,
          date: movement.occurred_on,
          description: movement.description ?? undefined,
          installments: movement.installment_plans[0]?.installments_count,
        }}
        autoFocus={false}
      />
    </Screen>
  );
}

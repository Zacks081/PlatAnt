import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ConfirmDelete } from "@/components/movements/confirm-delete";
import { MovementForm, TransferForm } from "@/components/movements/movement-form";
import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { PaydayForm } from "@/components/pay-periods/payday-form";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { getMovement, getTransferFee, openApp, type MovementRow } from "@/lib/movements/data";
import { dayLabel, PAYDAY_LABEL, POCKET_LABELS } from "@/lib/movements/format";
import { movementFormData } from "@/lib/movements/form-data";
import { safeReturnPath } from "@/lib/movements/validation";
import { getRecentPeriods } from "@/lib/pay-periods/data";
import { instanceFromRow } from "@/lib/pay-periods/schedule";
import { payOptionLabel } from "@/lib/pay-periods/summary";
import { fixedPocketPath } from "@/lib/pockets/fixed";
import { reconciliationLabel } from "@/lib/pockets/pockets";
import { cn } from "@/lib/utils";
import { addDays, todayInTimeZone, type CalendarDate } from "@/lib/dates";

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

  // Lo que entra, sale o se paga desde el bolsillo de un gasto fijo se maneja desde el bolsillo.
  const fixedPocket = [movement.pockets, movement.to_pocket].find(
    (pocket) => pocket?.kind === "fixed_expense",
  );
  if (fixedPocket) {
    return (
      <PocketMovementDetail
        movement={movement}
        pocket={fixedPocket}
        back={back}
        today={todayInTimeZone(user.timeZone)}
        currency={user.currency}
      />
    );
  }

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

  // Un pago de quincena: se corrige con su propio formulario, porque abrió una quincena.
  // Solo el último: los anteriores ya son historia.
  if (movement.origin === "payday") {
    const [latest] = await getRecentPeriods(db, 1);
    const today = todayInTimeZone(user.timeZone);
    const pocket = movement.pockets?.kind === "cash" ? "cash" : "account";
    if (latest?.movement_id === movement.id) {
      return (
        <Screen>
          <ItemHeader
            backHref={back}
            title={PAYDAY_LABEL}
            action={
              <ConfirmDelete
                action={deletePay.bind(null, latest.id, back)}
                title="¿Borrar este pago?"
                description="Se quita el ingreso y se cierra la quincena que abrió, con sus apartados. No se puede deshacer."
              />
            }
          />
          <PaydayForm
            action={updatePay.bind(null, latest.id, back)}
            today={today}
            minDate={addDays(today, -62)}
            initial={{ amount: movement.amount, date: movement.occurred_on, pocket }}
            note="Si cambias el valor o la fecha, los apartados de la quincena se ajustan solos."
            autoFocus={false}
            pay={{
              label: user.payDays.length > 1 ? "Quincena" : "Mes",
              fixed: payOptionLabel(instanceFromRow(latest), user.payDays),
            }}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <ItemHeader backHref={back} title={PAYDAY_LABEL} />
        <dl className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
          {[
            ["Valor", formatMoney(movement.amount, { currency: user.currency })],
            ["Bolsillo", POCKET_LABELS[pocket]],
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

/**
 * Un movimiento de un bolsillo de gasto fijo: lo que apartó la quincena, lo que se apartó o
 * sacó a mano, o el pago del gasto. Se ve aquí y se maneja desde el bolsillo; lo hecho a mano
 * se puede borrar (un pago borrado vuelve a quedar pendiente).
 */
function PocketMovementDetail({
  movement,
  pocket,
  back,
  today,
  currency,
}: {
  movement: MovementRow;
  pocket: { name: string; fixed_expense_id: string | null };
  back: string;
  today: CalendarDate;
  currency: string;
}) {
  const isPayment = movement.kind === "expense";
  const isAutomatic = movement.origin === "set_aside";
  const label = (kind: string | undefined, name: string | undefined) =>
    kind === "fixed_expense" ? `Bolsillo ${name ?? ""}` : (POCKET_LABELS[kind ?? ""] ?? "");
  const title = isPayment
    ? (movement.description ?? `Pago ${pocket.name}`)
    : movement.to_pocket?.kind === "fixed_expense"
      ? `Apartado ${pocket.name}`
      : `Sacado de ${pocket.name}`;
  const rows = [
    ["Valor", formatMoney(movement.amount, { currency })],
    ...(isPayment
      ? [
          ["Categoría", movement.categories?.name ?? "Sin categoría"],
          ["Sale de", label(movement.pockets?.kind, movement.pockets?.name)],
        ]
      : [
          ["Sale de", label(movement.pockets?.kind, movement.pockets?.name)],
          ["Entra a", label(movement.to_pocket?.kind, movement.to_pocket?.name)],
        ]),
    ["Fecha", dayLabel(movement.occurred_on, today)],
  ];

  return (
    <Screen>
      <ItemHeader
        backHref={back}
        title={title}
        action={
          isAutomatic ? undefined : (
            <ConfirmDelete
              action={deleteMovement.bind(null, movement.id, back)}
              title={isPayment ? "¿Borrar este pago?" : "¿Borrar este movimiento?"}
              description={
                isPayment
                  ? "La plata vuelve al bolsillo y el pago queda pendiente. No se puede deshacer."
                  : "La plata vuelve a como estaba antes. No se puede deshacer."
              }
            />
          )
        }
      />
      <dl className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
        {rows.map(([term, detail]) => (
          <div key={term} className="flex min-h-14 items-center justify-between gap-3">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="min-w-0 truncate font-semibold tabular-nums">{detail}</dd>
          </div>
        ))}
      </dl>
      {isAutomatic && (
        <p className="px-1 text-[13px] text-muted-foreground">
          Lo apartó la quincena al registrar el pago. Para devolverlo a la cuenta, usa «Sacar» en el
          bolsillo.
        </p>
      )}
      {pocket.fixed_expense_id && (
        <Link
          href={fixedPocketPath(pocket.fixed_expense_id)}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          Ver bolsillo
        </Link>
      )}
    </Screen>
  );
}

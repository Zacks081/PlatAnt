import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MovementForm, TransferForm } from "@/components/movements/movement-form";
import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { getLastUsed, openApp } from "@/lib/movements/data";
import { movementFormData } from "@/lib/movements/form-data";
import { safeReturnPath } from "@/lib/movements/validation";

import { saveMovement, saveTransfer } from "../../movimientos/actions";

export const metadata: Metadata = { title: "Registrar" };

const KINDS = { gasto: "expense", ingreso: "income" } as const;
const TRANSFERS = { retiro: "withdrawal", consignacion: "deposit" } as const;

type Props = Pick<PageProps<"/registrar/[tipo]">, "params" | "searchParams">;

export default function RegisterPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Register params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Register({ params, searchParams }: Props) {
  const { tipo } = await params;
  const kind = KINDS[tipo as keyof typeof KINDS];
  const direction = TRANSFERS[tipo as keyof typeof TRANSFERS];
  if (!kind && !direction) notFound();

  const back = safeReturnPath([(await searchParams).volver].flat()[0]);
  const { user, db } = await openApp();

  if (direction) {
    const form = await movementFormData(db, user, "expense");
    return (
      <Screen>
        <ItemHeader
          backHref={back}
          title={direction === "withdrawal" ? "Nuevo retiro" : "Nueva consignación"}
        />
        <TransferForm
          action={saveTransfer.bind(null, direction, null, back)}
          direction={direction}
          today={form.today}
          minDate={form.minDate}
          initial={{ date: form.todayIso }}
          autoFocus
        />
      </Screen>
    );
  }

  const [form, lastUsed] = await Promise.all([
    movementFormData(db, user, kind),
    getLastUsed(db, kind),
  ]);

  // Para registrar en segundos: la última categoría y el último bolsillo, si siguen disponibles.
  const categoryId = form.categories.some((option) => option.value === lastUsed?.category_id)
    ? lastUsed?.category_id
    : form.categories[0]?.value;
  const pocketId = form.pockets.some((option) => option.value === lastUsed?.pocket_id)
    ? lastUsed?.pocket_id
    : form.pockets[0]?.value;

  return (
    <Screen>
      <ItemHeader backHref={back} title={kind === "expense" ? "Nuevo gasto" : "Nuevo ingreso"} />
      <MovementForm
        action={saveMovement.bind(null, kind, null, back)}
        kind={kind}
        categories={form.categories}
        otherCategoryId={form.otherCategoryId}
        pockets={form.pockets}
        cardPocketId={form.cardPocketId}
        today={form.today}
        minDate={form.minDate}
        initial={{
          categoryId: categoryId ?? undefined,
          pocketId: pocketId ?? undefined,
          date: form.todayIso,
        }}
        autoFocus
      />
    </Screen>
  );
}

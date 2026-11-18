import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ConfirmDelete } from "@/components/movements/confirm-delete";
import { MovementForm } from "@/components/movements/movement-form";
import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { getMovement, openApp } from "@/lib/movements/data";
import { movementFormData } from "@/lib/movements/form-data";
import { safeReturnPath } from "@/lib/movements/validation";

import { deleteMovement, saveMovement } from "../../movimientos/actions";

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
  if (!movement || (movement.kind !== "expense" && movement.kind !== "income")) notFound();
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
        today={form.today}
        minDate={form.minDate}
        initial={{
          amount: movement.amount,
          categoryId: movement.category_id ?? undefined,
          pocketId: movement.pocket_id,
          date: movement.occurred_on,
          description: movement.description ?? undefined,
        }}
        autoFocus={false}
      />
    </Screen>
  );
}

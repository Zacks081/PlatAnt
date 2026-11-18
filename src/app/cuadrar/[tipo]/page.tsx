import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ItemHeader, Screen, ScreenFallback } from "@/components/onboarding/screen";
import { ReconcileForm } from "@/components/pockets/reconcile-form";
import { getBalances, openApp } from "@/lib/movements/data";
import { POCKET_NOUNS, POCKET_PATHS, pocketFromSlug } from "@/lib/pockets/pockets";

import { reconcilePocket } from "../../movimientos/actions";

export const metadata: Metadata = { title: "Cuadrar saldo" };

type Props = Pick<PageProps<"/cuadrar/[tipo]">, "params">;

export default function ReconcilePage({ params }: Props) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Reconcile params={params} />
    </Suspense>
  );
}

async function Reconcile({ params }: Props) {
  const kind = pocketFromSlug((await params).tipo);
  if (!kind) notFound();

  const { user, db } = await openApp();
  const balances = await getBalances(db);

  return (
    <Screen>
      <ItemHeader backHref={POCKET_PATHS[kind]} title={`Cuadrar ${POCKET_NOUNS[kind].the}`} />
      <ReconcileForm
        action={reconcilePocket.bind(null, kind)}
        expected={balances[kind]}
        currency={user.currency}
      />
    </Screen>
  );
}

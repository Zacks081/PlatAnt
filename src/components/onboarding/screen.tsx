import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { completeStep } from "@/app/configuracion/actions";
import { buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/session";
import { LAST_STEP, pathBeforeStep, STEPS, type StepNumber } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

/** Piezas de pantalla del recorrido inicial y de Ajustes (sin estado: se pintan en el servidor). */

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Contenedor de toda pantalla: ancho de celular y botón principal pegado abajo. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-3 pb-6">
      {children}
    </main>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary",
        focusRing,
      )}
    >
      <ChevronLeft aria-hidden="true" className="size-[22px]" />
    </Link>
  );
}

/**
 * Encabezado de un paso. Durante el recorrido muestra el avance y, si el paso es opcional,
 * «Saltar». Cuando se llega desde Ajustes o desde el resumen, solo la flecha de volver.
 */
export function StepHeader({ step, user }: { step: StepNumber; user: CurrentUser }) {
  const back = pathBeforeStep(step, user);
  const inWizard = !user.onboardingCompleted && user.onboardingStep < LAST_STEP;
  const { optional } = STEPS[step - 1];

  return (
    <header className="flex min-h-11 items-center gap-3">
      {back ? (
        <BackLink href={back} label="Volver" />
      ) : (
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}
      {inWizard && (
        <>
          <div
            role="img"
            aria-label={`Paso ${step} de ${LAST_STEP}`}
            className="flex flex-1 gap-[5px]"
          >
            {STEPS.map(({ number }) => (
              <span
                key={number}
                className={cn("h-1 flex-1 rounded-full", number <= step ? "bg-libre" : "bg-border")}
              />
            ))}
          </div>
          {optional ? (
            <form action={completeStep.bind(null, step)}>
              <button
                type="submit"
                className={cn(
                  "flex h-11 items-center rounded-full pr-1.5 pl-2.5 font-semibold text-muted-foreground",
                  focusRing,
                )}
              >
                Saltar
              </button>
            </form>
          ) : (
            <span aria-hidden="true" className="w-[52px] shrink-0" />
          )}
        </>
      )}
    </header>
  );
}

export function ScreenTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <h1 className="font-display text-[28px] leading-[1.1] font-bold tracking-[-0.02em] text-balance">
        {title}
      </h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Encabezado de un formulario de un solo elemento (un gasto fijo, una deuda…). */
export function ItemHeader({
  backHref,
  title,
  action,
}: {
  backHref: string;
  title: string;
  /** Algo a la derecha, como «Borrar». */
  action?: ReactNode;
}) {
  return (
    <header className="flex min-h-11 items-center gap-3">
      <BackLink href={backHref} label="Volver sin guardar" />
      <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{title}</h1>
      {action}
    </header>
  );
}

/** Botón «Borrar» de un elemento. Va en su propio formulario, aparte del de guardar. */
export function DeleteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={cn(
          "flex h-11 items-center rounded-full px-2 font-semibold text-gasto",
          focusRing,
        )}
      >
        Borrar
      </button>
    </form>
  );
}

type Item = { href: string; name: string; detail: string; amount: string };

/** Lista de elementos registrados; cada uno abre su formulario. */
export function ItemList({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-[24px] bg-card px-5">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={cn(
              "flex min-h-16 items-center justify-between gap-3 rounded-lg py-2.5",
              focusRing,
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-semibold">{item.name}</span>
              <span className="text-[13px] text-muted-foreground">{item.detail}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 font-display text-base font-semibold tabular-nums">
              {item.amount}
              <ChevronRight aria-hidden="true" className="size-[18px] text-muted-foreground" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Botón secundario para agregar un elemento a una lista. */
export function AddLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", className: "h-12 w-full" })}>
      <Plus aria-hidden="true" className="size-[18px]" />
      {children}
    </Link>
  );
}

/** Una línea con un total: etiqueta a la izquierda y cifra a la derecha. */
export function TotalLine({ label, amount }: { label: string; amount: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 px-5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-display text-[22px] font-bold tracking-[-0.02em] tabular-nums">
        {amount}
      </span>
    </p>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[13px] text-muted-foreground">{children}</p>;
}

/** Lo que se ve mientras llegan los datos de una pantalla. */
export function ScreenFallback() {
  return (
    <Screen>
      <div role="status" className="flex flex-col gap-5">
        <span className="sr-only">Cargando</span>
        <div aria-hidden="true" className="size-11 rounded-full bg-secondary" />
        <div aria-hidden="true" className="h-8 w-2/3 rounded-lg bg-card" />
        <div aria-hidden="true" className="h-44 rounded-[24px] bg-card" />
      </div>
    </Screen>
  );
}

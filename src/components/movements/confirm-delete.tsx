"use client";

import { useState } from "react";

import { Sheet } from "@/components/forms/sheet";
import { Button } from "@/components/ui/button";

/** «Borrar» con confirmación: abre una hoja que pregunta antes de borrar. */
export function ConfirmDelete({
  action,
  title,
  description,
}: {
  action: () => Promise<void>;
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center rounded-full px-2 font-semibold text-gasto outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Borrar
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={title}>
        <div className="flex flex-col gap-4 px-2 pt-1 pb-2">
          <p className="text-muted-foreground">{description}</p>
          <form action={action}>
            <Button
              type="submit"
              size="lg"
              className="w-full bg-gasto text-background hover:bg-gasto/85"
            >
              Sí, borrar
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
        </div>
      </Sheet>
    </>
  );
}

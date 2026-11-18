"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
};

/**
 * Hoja que sube desde abajo, para elegir una opción con el dedo.
 * Se cierra tocando afuera o con Escape, y mantiene el foco adentro mientras está abierta.
 */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-[28px] border-t border-border bg-card pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-200 outline-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full motion-reduce:transition-none">
          <div
            aria-hidden="true"
            className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-input"
          />
          <Dialog.Title className="shrink-0 px-5 pt-3 pb-2 font-display text-lg font-semibold">
            {title}
          </Dialog.Title>
          <div className="overflow-y-auto px-3 pb-1">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

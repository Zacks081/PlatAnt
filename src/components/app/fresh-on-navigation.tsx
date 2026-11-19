"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";

/**
 * Con Cache Components, Next no desmonta una pantalla al salir de ella: la esconde y guarda su
 * estado. En un formulario eso trae avisos y valores viejos al volver (por ejemplo, el «¿Otro
 * pago?» de un intento anterior). Así, cada vez que se entra a una pantalla con un enlace, sus
 * formularios empiezan de cero; con «atrás» del navegador se conserva lo que había.
 */
export function FreshOnNavigation({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}

import { Suspense } from "react";

import { BottomNav } from "@/components/app/bottom-nav";

/** Secciones principales de la app: llevan la barra de abajo con el botón +. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* Espacio abajo para que la barra flotante no tape el final del contenido. */}
      <div className="flex flex-1 flex-col pb-28">{children}</div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </>
  );
}

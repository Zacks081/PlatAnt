"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Bot,
  ChartPie,
  CreditCard,
  House,
  Landmark,
  Plus,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Secciones que todavía no existen: se ven en la barra pero aún no llevan a ningún lado. */
const UPCOMING = [
  { label: "Informes", icon: ChartPie },
  { label: "Metas", icon: Target },
  { label: "Deudas", icon: CreditCard },
  { label: "Asistente", icon: Bot },
];

/** Barra flotante de abajo, con el botón + para registrar un gasto o un ingreso. */
export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const back = encodeURIComponent(pathname);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  return (
    <>
      {menuOpen && (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Cerrar"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-background/85 backdrop-blur-[3px]"
          />
          <div
            id="menu-agregar"
            // Mismo ancho y márgenes que la barra, para quedar justo encima del botón +
            // también en pantallas anchas.
            className="pointer-events-none absolute inset-x-0 bottom-[calc(92px+env(safe-area-inset-bottom))] mx-auto flex w-full max-w-md flex-col items-end gap-3 px-4 *:pointer-events-auto"
          >
            {(
              [
                // De arriba hacia abajo; el más usado (Gasto) queda pegado al botón +.
                // Los traslados no son gasto ni ingreso: van en blanco.
                ["consignacion", "Consignación", "bg-foreground", Landmark],
                ["retiro", "Retiro", "bg-foreground", Banknote],
                ["ingreso", "Ingreso", "bg-libre", ArrowDownLeft],
                ["gasto", "Gasto", "bg-gasto", ArrowUpRight],
              ] as const
            ).map(([kind, label, color, Icon]) => (
              <Link
                key={kind}
                href={`/registrar/${kind}?volver=${back}`}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex h-[60px] items-center gap-[18px] rounded-full bg-popover pr-2 pl-[26px] text-[17px] font-semibold",
                  focusRing,
                )}
              >
                {label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full text-background",
                    color,
                  )}
                >
                  <Icon className="size-[22px]" strokeWidth={2.2} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-center gap-2.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex h-[60px] min-w-0 flex-1 items-center rounded-full bg-secondary px-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.45)]">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn(
              "flex h-12 flex-1 flex-col items-center justify-center gap-[3px] rounded-full text-[10px] font-semibold",
              focusRing,
              pathname === "/" ? "text-foreground" : "text-[#808a84]",
            )}
          >
            <House aria-hidden="true" className="size-[22px]" strokeWidth={1.8} />
            Inicio
          </Link>
          {UPCOMING.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-disabled="true"
              className={cn(
                "flex h-12 flex-1 cursor-default flex-col items-center justify-center gap-[3px] rounded-full text-[10px] font-semibold text-[#808a84]",
                focusRing,
              )}
            >
              <Icon aria-hidden="true" className="size-[22px]" strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={menuOpen ? "Cerrar" : "Agregar un gasto o un ingreso"}
          aria-expanded={menuOpen}
          aria-controls="menu-agregar"
          onClick={() => setMenuOpen((open) => !open)}
          className={cn(
            "flex size-[60px] shrink-0 items-center justify-center rounded-full",
            focusRing,
            menuOpen ? "bg-foreground text-background" : "bg-primary text-primary-foreground",
          )}
        >
          {menuOpen ? (
            <X aria-hidden="true" className="size-6" strokeWidth={2.2} />
          ) : (
            <Plus aria-hidden="true" className="size-[26px]" strokeWidth={2.4} />
          )}
        </button>
      </nav>
    </>
  );
}

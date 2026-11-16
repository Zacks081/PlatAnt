import Image from "next/image";
import type { ReactNode } from "react";

type AuthScreenProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Enlaces secundarios, debajo del formulario. */
  footer?: ReactNode;
};

/** Marco común de las pantallas de cuenta: ícono, título y contenido. */
export function AuthScreen({ title, description, children, footer }: AuthScreenProps) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-7 px-4 pt-14 pb-10">
      <header className="flex flex-col gap-5">
        <Image
          src="/marca/logo-icono.png"
          alt=""
          width={592}
          height={465}
          sizes="64px"
          priority
          className="h-auto w-16"
        />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[32px] leading-[1.1] font-bold tracking-[-0.02em]">
            {title}
          </h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      </header>

      {children}

      {footer && (
        <nav className="flex flex-col items-center gap-1 text-muted-foreground">{footer}</nav>
      )}
    </main>
  );
}

/** Estilo de los enlaces secundarios: zona de toque de 44 px. */
export const authLinkClass =
  "flex min-h-11 items-center rounded-full px-3 font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

import type { Metadata } from "next";
import Link from "next/link";

import { AuthScreen, authLinkClass } from "@/components/auth/auth-screen";
import { buttonVariants } from "@/components/ui/button";
import { authMessages } from "@/lib/auth/messages";

export const metadata: Metadata = { title: "Enlace vencido" };

export default function ExpiredLinkPage() {
  return (
    <AuthScreen
      title="Ese enlace ya no sirve"
      description="Los enlaces duran una hora y solo se pueden usar una vez."
      footer={
        <Link href="/entrar" className={authLinkClass}>
          Volver a entrar
        </Link>
      }
    >
      <p className="sr-only">{authMessages.expiredLink}</p>
      <Link href="/recuperar" className={buttonVariants({ size: "lg", className: "w-full" })}>
        Pedir otro enlace
      </Link>
    </AuthScreen>
  );
}

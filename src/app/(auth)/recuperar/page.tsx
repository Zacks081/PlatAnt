import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthScreen, authLinkClass } from "@/components/auth/auth-screen";

import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <AuthScreen
      title="Recupera tu contraseña"
      description="Escribe tu correo y te mandamos un enlace para elegir una nueva."
      footer={
        <Link href="/entrar" className={authLinkClass}>
          Volver a entrar
        </Link>
      }
    >
      <AuthForm
        action={requestPasswordReset}
        submitLabel="Enviar enlace"
        pendingLabel="Enviando…"
        fields={[{ name: "email", label: "Correo", type: "email", autoComplete: "email" }]}
      />
    </AuthScreen>
  );
}

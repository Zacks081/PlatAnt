import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthScreen, authLinkClass } from "@/components/auth/auth-screen";
import { isRegistrationOpen } from "@/lib/env";

import { signIn } from "../actions";

export const metadata: Metadata = { title: "Entrar" };

export default function SignInPage() {
  return (
    <AuthScreen
      title="Hola de nuevo"
      description="Entra para ver cómo va tu plata."
      footer={
        <>
          <Link href="/recuperar" className={authLinkClass}>
            Olvidé mi contraseña
          </Link>
          {isRegistrationOpen() && (
            <Link href="/registro" className={authLinkClass}>
              Crear una cuenta
            </Link>
          )}
        </>
      }
    >
      <AuthForm
        action={signIn}
        submitLabel="Entrar"
        pendingLabel="Entrando…"
        fields={[
          { name: "email", label: "Correo", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Contraseña",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />
    </AuthScreen>
  );
}

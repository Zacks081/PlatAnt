import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthScreen, authLinkClass } from "@/components/auth/auth-screen";
import { authMessages } from "@/lib/auth/messages";
import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";
import { isRegistrationOpen } from "@/lib/env";

import { signUp } from "../actions";

export const metadata: Metadata = { title: "Crear cuenta" };

const signInLink = (
  <Link href="/entrar" className={authLinkClass}>
    Ya tengo cuenta
  </Link>
);

export default function SignUpPage() {
  if (!isRegistrationOpen()) {
    return (
      <AuthScreen title="Crear cuenta" footer={signInLink}>
        <p className="rounded-lg bg-card p-5 leading-normal">{authMessages.registrationClosed}</p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Crea tu cuenta" footer={signInLink}>
      <AuthForm
        action={signUp}
        submitLabel="Crear cuenta"
        pendingLabel="Creando tu cuenta…"
        fields={[
          {
            name: "name",
            label: "Nombre de usuario",
            type: "text",
            // "nickname" y no "username": así el administrador de contraseñas no lo toma
            // como el usuario para entrar, que es el correo.
            autoComplete: "nickname",
            maxLength: NAME_MAX_LENGTH,
          },
          { name: "email", label: "Correo", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Contraseña",
            type: "password",
            autoComplete: "new-password",
            hint: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con letras y números.`,
          },
        ]}
      />
    </AuthScreen>
  );
}

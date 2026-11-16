import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { AuthScreen } from "@/components/auth/auth-screen";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";

import { updatePassword } from "../actions";

export const metadata: Metadata = { title: "Nueva contraseña" };

/** Solo se llega aquí con sesión: la abre el enlace del correo (ver src/app/auth/confirm). */
export default function NewPasswordPage() {
  return (
    <AuthScreen title="Elige tu nueva contraseña">
      <AuthForm
        action={updatePassword}
        submitLabel="Guardar contraseña"
        pendingLabel="Guardando…"
        fields={[
          {
            name: "password",
            label: "Contraseña nueva",
            type: "password",
            autoComplete: "new-password",
            hint: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con letras y números.`,
          },
        ]}
      />
    </AuthScreen>
  );
}

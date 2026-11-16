/**
 * Mensajes que ve el usuario cuando algo falla con su cuenta.
 * Ninguno revela si un correo tiene cuenta o no: eso ayudaría a quien intenta adivinar cuentas.
 */

export const authMessages = {
  invalidCredentials: "Correo o contraseña incorrectos.",
  tooManyAttempts: "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentar.",
  generic: "Algo falló de nuestro lado. Intenta de nuevo en un momento.",
  registrationClosed: "El registro está cerrado por ahora.",
  signUpFailed: "No pudimos crear la cuenta con ese correo. Si ya tienes una, entra con ella.",
  weakPassword: "Esa contraseña es muy fácil de adivinar. Prueba con otra.",
} as const;

type AuthErrorLike = { code?: string | null; status?: number | null } | null | undefined;

/** Traduce un error de inicio de sesión de Supabase a un mensaje que no revela nada de más. */
export function signInErrorMessage(error: AuthErrorLike): string {
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return authMessages.tooManyAttempts;
  }
  if (error?.status === 400 || error?.code === "invalid_credentials") {
    return authMessages.invalidCredentials;
  }
  return authMessages.generic;
}

/** Traduce un error al crear la cuenta. */
export function signUpErrorMessage(error: AuthErrorLike): string {
  switch (error?.code) {
    case "email_exists":
    case "user_already_exists":
      return authMessages.signUpFailed;
    case "weak_password":
      return authMessages.weakPassword;
    case "over_request_rate_limit":
      return authMessages.tooManyAttempts;
    default:
      return authMessages.generic;
  }
}

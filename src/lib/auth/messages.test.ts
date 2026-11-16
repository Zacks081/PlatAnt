import { describe, expect, it } from "vitest";

import { authMessages, signInErrorMessage, signUpErrorMessage } from "./messages";

describe("mensajes de inicio de sesión", () => {
  it("responde lo mismo si el correo no existe o si la contraseña está mal", () => {
    // Supabase devuelve el mismo código en los dos casos; aquí se comprueba que no se distingan.
    const wrongPassword = signInErrorMessage({ code: "invalid_credentials", status: 400 });
    const unknownEmail = signInErrorMessage({ code: "invalid_credentials", status: 400 });
    const otherBadRequest = signInErrorMessage({ code: "email_not_confirmed", status: 400 });
    expect(wrongPassword).toBe(authMessages.invalidCredentials);
    expect(unknownEmail).toBe(wrongPassword);
    expect(otherBadRequest).toBe(wrongPassword);
  });

  it("avisa cuando hay demasiados intentos", () => {
    expect(signInErrorMessage({ status: 429 })).toBe(authMessages.tooManyAttempts);
    expect(signInErrorMessage({ code: "over_request_rate_limit" })).toBe(
      authMessages.tooManyAttempts,
    );
  });

  it("no muestra detalles técnicos ante un error inesperado", () => {
    expect(signInErrorMessage({ status: 500, code: "unexpected_failure" })).toBe(
      authMessages.generic,
    );
    expect(signInErrorMessage(null)).toBe(authMessages.generic);
  });
});

describe("mensajes de registro", () => {
  it("traduce correo repetido y contraseña débil", () => {
    expect(signUpErrorMessage({ code: "email_exists" })).toBe(authMessages.signUpFailed);
    expect(signUpErrorMessage({ code: "user_already_exists" })).toBe(authMessages.signUpFailed);
    expect(signUpErrorMessage({ code: "weak_password" })).toBe(authMessages.weakPassword);
  });

  it("usa el mensaje general para lo demás", () => {
    expect(signUpErrorMessage({ code: "unexpected_failure" })).toBe(authMessages.generic);
  });
});

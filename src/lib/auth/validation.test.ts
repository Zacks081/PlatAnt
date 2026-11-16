import { describe, expect, it } from "vitest";

import { firstFieldErrors, readForm, signInSchema, signUpSchema } from "./validation";

const validSignUp = { name: "Santiago", email: "santiago@example.com", password: "clave1234" };

function errorsOf(input: unknown) {
  const parsed = signUpSchema.safeParse(input);
  return parsed.success ? {} : firstFieldErrors(parsed.error);
}

describe("registro", () => {
  it("acepta nombre, correo y contraseña válidos", () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it("limpia espacios y pasa el correo a minúsculas", () => {
    const parsed = signUpSchema.parse({
      ...validSignUp,
      name: "  Santiago  ",
      email: "  Santiago@Example.COM ",
    });
    expect(parsed.name).toBe("Santiago");
    expect(parsed.email).toBe("santiago@example.com");
  });

  it("rechaza el nombre vacío o de solo espacios", () => {
    expect(errorsOf({ ...validSignUp, name: "" }).name).toBe("Escribe tu nombre.");
    expect(errorsOf({ ...validSignUp, name: "   " }).name).toBe("Escribe tu nombre.");
  });

  it("rechaza un nombre demasiado largo", () => {
    expect(errorsOf({ ...validSignUp, name: "a".repeat(61) }).name).toMatch(/máximo 60/);
  });

  it("rechaza correos mal escritos", () => {
    expect(errorsOf({ ...validSignUp, email: "" }).email).toBe("Escribe tu correo.");
    expect(errorsOf({ ...validSignUp, email: "santiago@" }).email).toMatch(/no parece válido/);
    expect(errorsOf({ ...validSignUp, email: "sin-arroba.com" }).email).toMatch(/no parece válido/);
  });

  it.each([
    ["corta", "abc1234", /al menos 8/],
    ["sin números", "solamenteletras", /un número/],
    ["sin letras", "1234567890", /una letra/],
    ["demasiado larga", `a1${"x".repeat(71)}`, /máximo 72/],
  ])("rechaza una contraseña %s", (_caso, password, expected) => {
    expect(errorsOf({ ...validSignUp, password }).password).toMatch(expected);
  });

  it("no recorta la contraseña: los espacios cuentan", () => {
    expect(signUpSchema.parse({ ...validSignUp, password: " clave 1234 " }).password).toBe(
      " clave 1234 ",
    );
  });

  it("acepta letras con tilde y eñe en la contraseña", () => {
    expect(signUpSchema.safeParse({ ...validSignUp, password: "ñandú2026" }).success).toBe(true);
  });

  it("informa un solo error por campo", () => {
    const errors = errorsOf({ name: "", email: "", password: "" });
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "password"]);
  });
});

describe("inicio de sesión", () => {
  it("no revisa la fuerza de la contraseña, solo que exista", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("readForm", () => {
  it("lee solo los campos pedidos y trata lo que falta como vacío", () => {
    const formData = new FormData();
    formData.set("email", "a@b.co");
    formData.set("otro", "se ignora");
    formData.set("archivo", new Blob(["x"]));
    expect(readForm(formData, ["email", "password", "archivo"])).toEqual({
      email: "a@b.co",
      password: "",
      archivo: "",
    });
  });
});

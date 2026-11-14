import { describe, expect, it } from "vitest";

// Prueba rota a propósito, solo para comprobar que la revisión automática marca el PR como fallido.
describe("prueba del PR fallido", () => {
  it("falla a propósito", () => {
    expect(1 + 1).toBe(3);
  });
});

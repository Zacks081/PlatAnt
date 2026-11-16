import { afterEach, describe, expect, it, vi } from "vitest";

import { isRegistrationOpen } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("registro de cuentas", () => {
  it("está cerrado si la variable no existe", () => {
    vi.stubEnv("REGISTRATION_OPEN", undefined);
    expect(isRegistrationOpen()).toBe(false);
  });

  it.each(["false", "", "1", "TRUE", "si", " true"])("está cerrado con %j", (value) => {
    vi.stubEnv("REGISTRATION_OPEN", value);
    expect(isRegistrationOpen()).toBe(false);
  });

  it('solo se abre con exactamente "true"', () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    expect(isRegistrationOpen()).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { periodRange } from "./periods";

const today = { year: 2026, month: 11, day: 18 };
const noCustom = { from: null, to: null };

describe("filtro de quincena del historial", () => {
  it("con pagos registrados, va desde el día en que llegó cada pago", () => {
    const registered = { current: "2026-11-13", previous: "2026-10-30" };
    expect(periodRange("esta-quincena", today, [15, 30], noCustom, registered).range).toEqual({
      from: "2026-11-13",
      to: "2026-11-18",
    });
    expect(periodRange("quincena-pasada", today, [15, 30], noCustom, registered).range).toEqual({
      from: "2026-10-30",
      to: "2026-11-12",
    });
  });

  it("sin pagos registrados, usa los días de pago del calendario", () => {
    expect(periodRange("esta-quincena", today, [15, 30], noCustom).range).toEqual({
      from: "2026-11-15",
      to: "2026-11-18",
    });
    expect(periodRange("quincena-pasada", today, [15, 30], noCustom).range).toEqual({
      from: "2026-10-30",
      to: "2026-11-14",
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  nextDueDate,
  pocketActionFromSlug,
  pocketMovementLabel,
  pocketProgress,
  quincenaPocketTotals,
} from "./fixed";

describe("bolsillo de un gasto fijo", () => {
  it("cuánto falta, si alcanza y qué tan lleno está", () => {
    expect(pocketProgress(60_000, 120_000)).toEqual({ missing: 60_000, ready: false, filled: 0.5 });
    expect(pocketProgress(130_000, 120_000)).toEqual({ missing: 0, ready: true, filled: 1 });
    expect(pocketProgress(-10_000, 120_000)).toEqual({
      missing: 130_000,
      ready: false,
      filled: 0,
    });
  });

  it("el próximo vencimiento: este mes si no ha pasado, si no el siguiente", () => {
    const today = { year: 2026, month: 11, day: 19 };
    expect(nextDueDate(today, 30)).toEqual({ year: 2026, month: 11, day: 30 });
    expect(nextDueDate(today, 19)).toEqual({ year: 2026, month: 11, day: 19 });
    expect(nextDueDate(today, 5)).toEqual({ year: 2026, month: 12, day: 5 });
    // Un gasto del 31 en febrero vence el último día.
    expect(nextDueDate({ year: 2027, month: 2, day: 1 }, 31)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
  });

  it("las acciones por su nombre en la dirección", () => {
    expect(pocketActionFromSlug("apartar")).toBe("in");
    expect(pocketActionFromSlug("sacar")).toBe("out");
    expect(pocketActionFromSlug("pagar")).toBe("pay");
    expect(pocketActionFromSlug("toString")).toBeNull();
  });
});

describe("totales de la quincena con bolsillos", () => {
  it("en bolsillos y falta cuentan lo pendiente; pagado, lo pagado", () => {
    expect(
      quincenaPocketTotals([
        { balance: 60_000, total: 120_000, paidAmount: null },
        { balance: 700_000, total: 700_000, paidAmount: null },
        { balance: 0, total: 110_000, paidAmount: 110_000 },
      ]),
    ).toEqual({ inPockets: 760_000, paid: 110_000, missing: 60_000, count: 3, paidCount: 1 });
  });

  it("un bolsillo en negativo no resta de lo que hay en bolsillos", () => {
    expect(quincenaPocketTotals([{ balance: -5_000, total: 50_000, paidAmount: null }])).toEqual({
      inPockets: 0,
      paid: 0,
      missing: 55_000,
      count: 1,
      paidCount: 0,
    });
  });
});

describe("movimientos dentro del bolsillo", () => {
  const pocketId = "bolsillo";
  const base = { description: null, to_pocket_id: null };

  it("lo de la quincena, lo de antes, lo apartado, lo sacado y el pago", () => {
    expect(
      pocketMovementLabel(
        { ...base, kind: "transfer", origin: "set_aside", to_pocket_id: pocketId },
        pocketId,
      ),
    ).toEqual({ title: "Apartado de la quincena", incoming: true });
    expect(
      pocketMovementLabel({ ...base, kind: "income", origin: "opening_balance" }, pocketId),
    ).toEqual({ title: "Ya lo tenías apartado", incoming: true });
    expect(
      pocketMovementLabel(
        { ...base, kind: "transfer", origin: "manual", to_pocket_id: pocketId },
        pocketId,
      ),
    ).toEqual({ title: "Apartaste de la cuenta", incoming: true });
    expect(
      pocketMovementLabel(
        { ...base, kind: "transfer", origin: "manual", to_pocket_id: "cuenta" },
        pocketId,
      ),
    ).toEqual({ title: "Sacaste a la cuenta", incoming: false });
    expect(
      pocketMovementLabel(
        { ...base, kind: "expense", origin: "manual", description: "Pago Gasolina" },
        pocketId,
      ),
    ).toEqual({ title: "Pago Gasolina", incoming: false });
  });
});

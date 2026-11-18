import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { admin, createTestUser, deleteTestUsers } from "./local-supabase";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

let ana: TestUser;
let beto: TestUser;
const ids = { account: "", cash: "", comida: "", fees: "" };

function ok<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}

async function balances(user: TestUser = ana) {
  const rows = ok(await user.client.rpc("pocket_balances"));
  const find = (kind: string) => Number(rows.find((row) => row.kind === kind)?.balance ?? 0);
  return { account: find("account"), cash: find("cash") };
}

function withdraw(amount: number, extra: { p_id?: string; p_fee?: number } = {}) {
  return ana.client.rpc("save_transfer", {
    p_from: "account",
    p_amount: amount,
    p_occurred_on: "2026-11-18",
    ...extra,
  });
}

/** Cada prueba arranca con 1.000.000 en la cuenta, 50.000 en efectivo y nada más. */
beforeEach(async () => {
  await admin.from("movements").delete().eq("user_id", ana.id).neq("origin", "opening_balance");
});

beforeAll(async () => {
  [ana, beto] = await Promise.all([createTestUser("Ana"), createTestUser("Beto")]);
  ok(await ana.client.rpc("set_opening_balance", { p_kind: "account", p_amount: 1_000_000 }));
  ok(await ana.client.rpc("set_opening_balance", { p_kind: "cash", p_amount: 50_000 }));
  const pockets = ok(await ana.client.from("pockets").select("id, kind"));
  ids.account = pockets.find((pocket) => pocket.kind === "account")!.id;
  ids.cash = pockets.find((pocket) => pocket.kind === "cash")!.id;
  const categories = ok(await ana.client.from("categories").select("id, name, is_system"));
  ids.comida = categories.find((category) => category.name === "Comida")!.id;
  ids.fees = categories.find((category) => category.name === "Comisiones y cargos")!.id;
});

afterAll(deleteTestUsers);

describe("retiro y consignación", () => {
  it("un retiro baja la cuenta y sube el efectivo por lo mismo; el total no cambia", async () => {
    ok(await withdraw(200_000));
    expect(await balances()).toEqual({ account: 800_000, cash: 250_000 });
  });

  it("una consignación hace lo contrario", async () => {
    ok(
      await ana.client.rpc("save_transfer", {
        p_from: "cash",
        p_amount: 30_000,
        p_occurred_on: "2026-11-18",
      }),
    );
    expect(await balances()).toEqual({ account: 1_030_000, cash: 20_000 });
  });

  it("un traslado no es gasto ni ingreso: no lleva categoría", async () => {
    const id = ok(await withdraw(100_000));
    const row = ok(
      await ana.client.from("movements").select("kind, category_id").eq("id", id).single(),
    );
    expect(row).toEqual({ kind: "transfer", category_id: null });
  });

  it("editar un retiro deja los dos bolsillos consistentes", async () => {
    const id = ok(await withdraw(200_000));
    ok(await withdraw(150_000, { p_id: id }));
    expect(await balances()).toEqual({ account: 850_000, cash: 200_000 });
  });

  it("al editar, el sentido no cambia: un retiro no se vuelve consignación", async () => {
    const id = ok(await withdraw(200_000));
    const { error } = await ana.client.rpc("save_transfer", {
      p_from: "cash",
      p_amount: 10_000,
      p_occurred_on: "2026-11-18",
      p_id: id,
    });
    expect(error?.code).toBe("P0002");
    expect(await balances()).toEqual({ account: 800_000, cash: 250_000 });
  });

  it("borrar un traslado devuelve los dos saldos", async () => {
    const id = ok(await withdraw(200_000));
    ok(await ana.client.from("movements").delete().eq("id", id).select("id"));
    expect(await balances()).toEqual({ account: 1_000_000, cash: 50_000 });
  });

  it("un bolsillo puede quedar en negativo", async () => {
    ok(
      await ana.client.rpc("save_transfer", {
        p_from: "cash",
        p_amount: 80_000,
        p_occurred_on: "2026-11-18",
      }),
    );
    expect((await balances()).cash).toBe(-30_000);
  });

  it("no se traslada con la tarjeta", async () => {
    const { error } = await ana.client.rpc("save_transfer", {
      p_from: "credit_card",
      p_amount: 1_000,
      p_occurred_on: "2026-11-18",
    });
    expect(error?.code).toBe("23514");
  });
});

describe("costo del retiro", () => {
  async function fee(transferId: string) {
    return ok(
      await ana.client
        .from("movements")
        .select("kind, amount, category_id, pocket_id, occurred_on")
        .eq("parent_id", transferId),
    );
  }

  it("se guarda aparte como gasto de la cuenta, en «Comisiones y cargos»", async () => {
    const id = ok(await withdraw(200_000, { p_fee: 4_500 }));
    expect(await fee(id)).toEqual([
      {
        kind: "expense",
        amount: 4_500,
        category_id: ids.fees,
        pocket_id: ids.account,
        occurred_on: "2026-11-18",
      },
    ]);
    expect(await balances()).toEqual({ account: 795_500, cash: 250_000 });
  });

  it("editar el retiro cambia su costo, o lo quita con 0", async () => {
    const id = ok(await withdraw(200_000, { p_fee: 4_500 }));
    ok(await withdraw(200_000, { p_id: id, p_fee: 6_000 }));
    expect((await fee(id)).map((row) => row.amount)).toEqual([6_000]);
    ok(await withdraw(200_000, { p_id: id, p_fee: 0 }));
    expect(await fee(id)).toEqual([]);
    expect(await balances()).toEqual({ account: 800_000, cash: 250_000 });
  });

  it("borrar el retiro borra también su costo", async () => {
    const id = ok(await withdraw(200_000, { p_fee: 4_500 }));
    ok(await ana.client.from("movements").delete().eq("id", id).select("id"));
    expect(await fee(id)).toEqual([]);
    expect(await balances()).toEqual({ account: 1_000_000, cash: 50_000 });
  });

  it("una consignación no tiene costo", async () => {
    const { error } = await ana.client.rpc("save_transfer", {
      p_from: "cash",
      p_amount: 10_000,
      p_occurred_on: "2026-11-18",
      p_fee: 1_000,
    });
    expect(error?.code).toBe("23514");
  });

  it("la categoría de comisiones es del sistema y existe para todos", async () => {
    const rows = ok(
      await beto.client.from("categories").select("is_system").eq("name", "Comisiones y cargos"),
    );
    expect(rows).toEqual([{ is_system: true }]);
  });
});

describe("cuadre de saldo", () => {
  async function reconcile(p_kind: "account" | "cash", p_actual: number, user = ana) {
    const p_expected = (await balances(user))[p_kind];
    return user.client.rpc("reconcile_pocket", { p_kind, p_expected, p_actual });
  }

  async function adjustments() {
    return ok(
      await ana.client
        .from("movements")
        .select("kind, amount, pocket_id, category_id")
        .eq("origin", "reconciliation"),
    );
  }

  it("con menos plata, registra un gasto sin registrar y el saldo queda en lo escrito", async () => {
    expect(ok(await reconcile("account", 940_000))).toBe(-60_000);
    expect(await adjustments()).toEqual([
      { kind: "expense", amount: 60_000, pocket_id: ids.account, category_id: null },
    ]);
    expect((await balances()).account).toBe(940_000);
  });

  it("con más plata, registra un ingreso sin registrar", async () => {
    expect(ok(await reconcile("cash", 72_000))).toBe(22_000);
    expect(await adjustments()).toEqual([
      { kind: "income", amount: 22_000, pocket_id: ids.cash, category_id: null },
    ]);
    expect((await balances()).cash).toBe(72_000);
  });

  it("sin diferencia, no registra nada", async () => {
    expect(await reconcile("cash", 50_000)).toMatchObject({ data: 0, error: null });
    expect(await adjustments()).toEqual([]);
  });

  it("un bolsillo en negativo queda en lo que hay de verdad", async () => {
    ok(
      await ana.client.rpc("save_transfer", {
        p_from: "cash",
        p_amount: 80_000,
        p_occurred_on: "2026-11-18",
      }),
    );
    expect(ok(await reconcile("cash", 0))).toBe(30_000);
    expect((await balances()).cash).toBe(0);
  });

  it("si el saldo cambió desde que lo vio, no cuadra", async () => {
    const { error } = await ana.client.rpc("reconcile_pocket", {
      p_kind: "account",
      p_expected: 999_999,
      p_actual: 900_000,
    });
    expect(error?.code).toBe("PA409");
    expect(await adjustments()).toEqual([]);
  });

  it("borrar el ajuste devuelve el saldo de antes", async () => {
    ok(await reconcile("account", 940_000));
    ok(await ana.client.from("movements").delete().eq("origin", "reconciliation").select("id"));
    expect((await balances()).account).toBe(1_000_000);
  });

  it("no acepta un saldo negativo ni la tarjeta", async () => {
    expect((await reconcile("account", -1)).error?.code).toBe("23514");
    const { error } = await ana.client.rpc("reconcile_pocket", {
      p_kind: "credit_card",
      p_expected: 0,
      p_actual: 0,
    });
    expect(error?.code).toBe("23514");
  });

  it("cada usuario cuadra solo sus bolsillos", async () => {
    ok(await reconcile("account", 5_000, beto));
    expect(await balances()).toEqual({ account: 1_000_000, cash: 50_000 });
    expect((await balances(beto)).account).toBe(5_000);
  });
});

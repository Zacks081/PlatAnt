import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { admin, createTestUser, deleteTestUsers } from "./local-supabase";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

let ana: TestUser;
let beto: TestUser;
const ids = { account: "", cash: "", card: "", comida: "", salario: "" };

function ok<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}

async function balances(user: TestUser) {
  const rows = ok(await user.client.rpc("pocket_balances"));
  return Object.fromEntries(rows.map((row) => [row.kind, Number(row.balance)]));
}

function expense(amount: number, extra: object = {}) {
  return {
    kind: "expense" as const,
    amount,
    occurred_on: "2026-11-18",
    pocket_id: ids.account,
    category_id: ids.comida,
    ...extra,
  };
}

beforeAll(async () => {
  [ana, beto] = await Promise.all([createTestUser("Ana"), createTestUser("Beto")]);
  ok(await ana.client.rpc("set_opening_balance", { p_kind: "account", p_amount: 1_000_000 }));
  ok(await ana.client.rpc("set_opening_balance", { p_kind: "cash", p_amount: 50_000 }));
  ok(
    await ana.client.rpc("save_credit_card", {
      p_statement_day: 15,
      p_payment_day: 30,
      p_monthly_rate: 3,
      p_rate_is_estimated: true,
      p_debt: 200_000,
    }),
  );
  const pockets = ok(await ana.client.from("pockets").select("id, kind"));
  ids.account = pockets.find((pocket) => pocket.kind === "account")!.id;
  ids.cash = pockets.find((pocket) => pocket.kind === "cash")!.id;
  ids.card = pockets.find((pocket) => pocket.kind === "credit_card")!.id;
  const categories = ok(await ana.client.from("categories").select("id, name"));
  ids.comida = categories.find((category) => category.name === "Comida")!.id;
  ids.salario = categories.find((category) => category.name === "Salario")!.id;
});

afterAll(deleteTestUsers);

describe("saldos de los bolsillos", () => {
  it("parten de los saldos iniciales; la tarjeta queda en negativo (lo que se debe)", async () => {
    expect(await balances(ana)).toEqual({
      account: 1_000_000,
      cash: 50_000,
      credit_card: -200_000,
    });
  });

  it("un gasto resta, editarlo corrige y borrarlo devuelve el saldo", async () => {
    const created = ok(
      await ana.client.from("movements").insert(expense(18_000)).select("id").single(),
    );
    expect((await balances(ana)).account).toBe(982_000);

    ok(
      await ana.client
        .from("movements")
        .update({ amount: 20_000 })
        .eq("id", created.id)
        .select("id"),
    );
    expect((await balances(ana)).account).toBe(980_000);

    ok(
      await ana.client
        .from("movements")
        .update({ pocket_id: ids.cash })
        .eq("id", created.id)
        .select("id"),
    );
    expect(await balances(ana)).toMatchObject({ account: 1_000_000, cash: 30_000 });

    ok(await ana.client.from("movements").delete().eq("id", created.id).select("id"));
    expect(await balances(ana)).toMatchObject({ account: 1_000_000, cash: 50_000 });
  });

  it("un ingreso suma", async () => {
    const created = ok(
      await ana.client
        .from("movements")
        .insert({
          kind: "income",
          amount: 1_100_000,
          occurred_on: "2026-11-15",
          pocket_id: ids.account,
          category_id: ids.salario,
        })
        .select("id")
        .single(),
    );
    expect((await balances(ana)).account).toBe(2_100_000);
    ok(await ana.client.from("movements").delete().eq("id", created.id).select("id"));
  });

  it("un gasto con tarjeta sube lo que se debe", async () => {
    const created = ok(
      await ana.client
        .from("movements")
        .insert(expense(45_000, { pocket_id: ids.card }))
        .select("id")
        .single(),
    );
    expect((await balances(ana)).credit_card).toBe(-245_000);
    ok(await ana.client.from("movements").delete().eq("id", created.id).select("id"));
  });

  it("un movimiento con fecha pasada también cuenta", async () => {
    const created = ok(
      await ana.client
        .from("movements")
        .insert(expense(10_000, { occurred_on: "2025-03-01" }))
        .select("id")
        .single(),
    );
    expect((await balances(ana)).account).toBe(990_000);
    ok(await ana.client.from("movements").delete().eq("id", created.id).select("id"));
  });

  it("cada usuario ve solo sus saldos", async () => {
    expect(await balances(beto)).toEqual({ account: 0, cash: 0 });
  });
});

describe("reglas de los movimientos", () => {
  it("un gasto registrado a mano exige categoría", async () => {
    const { error } = await ana.client
      .from("movements")
      .insert(expense(5_000, { category_id: null }));
    expect(error?.code).toBe("23514");
  });

  it("la categoría tiene que ser del mismo tipo que el movimiento", async () => {
    const { error } = await ana.client
      .from("movements")
      .insert(expense(5_000, { category_id: ids.salario }));
    expect(error?.code).toBe("23514");
  });

  it("no se puede usar la categoría ni el bolsillo de otro usuario", async () => {
    const betoAccount = ok(
      await beto.client.from("pockets").select("id").eq("kind", "account").single(),
    ).id;
    const foreignCategory = await beto.client
      .from("movements")
      .insert(expense(5_000, { pocket_id: betoAccount }));
    const foreignPocket = await ana.client
      .from("movements")
      .insert(expense(5_000, { pocket_id: betoAccount }));
    expect(foreignCategory.error?.code).toBe("23503");
    expect(foreignPocket.error?.code).toBe("23503");
  });
});

describe("categorías", () => {
  it("se pueden crear con ícono y marca de hormiga, y renombrar", async () => {
    const created = ok(
      await ana.client
        .from("categories")
        .insert({ name: "Café", kind: "expense", icon: "cafe", is_ant: true })
        .select("id, icon, is_ant")
        .single(),
    );
    expect(created).toMatchObject({ icon: "cafe", is_ant: true });
    const renamed = ok(
      await ana.client
        .from("categories")
        .update({ name: "Tintos" })
        .eq("id", created.id)
        .select("name")
        .single(),
    );
    expect(renamed.name).toBe("Tintos");
  });

  it("una categoría oculta conserva sus movimientos", async () => {
    const category = ok(
      await ana.client
        .from("categories")
        .insert({ name: "Snacks", kind: "expense", icon: "otros" })
        .select("id")
        .single(),
    );
    const movement = ok(
      await ana.client
        .from("movements")
        .insert(expense(3_000, { category_id: category.id }))
        .select("id")
        .single(),
    );
    ok(
      await ana.client
        .from("categories")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", category.id)
        .select("id"),
    );
    const kept = ok(
      await ana.client
        .from("movements")
        .select("category_id, categories(name)")
        .eq("id", movement.id)
        .single(),
    );
    expect(kept).toMatchObject({ category_id: category.id, categories: { name: "Snacks" } });
    ok(await ana.client.from("movements").delete().eq("id", movement.id).select("id"));
  });

  it("no se pueden borrar, ni tocar las de otro usuario", async () => {
    const remove = await ana.client.from("categories").delete().eq("id", ids.comida);
    expect(remove.error?.code).toBe("42501");
    const foreign = await beto.client
      .from("categories")
      .update({ name: "Hackeada" })
      .eq("id", ids.comida)
      .select("id");
    expect(foreign.data).toEqual([]);
    const name = ok(await admin.from("categories").select("name").eq("id", ids.comida).single());
    expect(name.name).toBe("Comida");
  });

  it("las categorías de arranque nacen con su ícono", async () => {
    const { data } = await beto.client.from("categories").select("name, icon").eq("name", "Comida");
    expect(data).toEqual([{ name: "Comida", icon: "comida" }]);
  });
});

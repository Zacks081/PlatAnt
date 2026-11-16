import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { admin, anonymousClient, createTestUser, deleteTestUsers } from "./local-supabase";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const OWNED_TABLES = [
  "pockets",
  "categories",
  "movements",
  "fixed_expenses",
  "credit_cards",
  "installment_plans",
  "debts",
  "goals",
] as const;
type OwnedTable = (typeof OWNED_TABLES)[number];

let ana: TestUser;
let beto: TestUser;
/** Una fila de Ana en cada tabla, para intentar tocarla desde la cuenta de Beto. */
const anaRows = {} as Record<OwnedTable, string>;

/** Falla con el mensaje de la base de datos si la operación de preparación no funcionó. */
function ok<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}

async function categoryId(user: TestUser, name: string) {
  return ok(
    await user.client
      .from("categories")
      .select("id")
      .eq("name", name)
      .eq("kind", "expense")
      .single(),
  ).id;
}

async function pocketId(user: TestUser, kind: "account" | "cash" | "credit_card") {
  return ok(await user.client.from("pockets").select("id").eq("kind", kind).single()).id;
}

beforeAll(async () => {
  [ana, beto] = await Promise.all([createTestUser("Ana"), createTestUser("Beto")]);

  // Ana hace el recorrido completo.
  ok(
    await ana.client
      .from("profiles")
      .update({ monthly_income: 2_400_000, pay_frequency: "biweekly", pay_days: [15, 30] })
      .eq("id", ana.id)
      .select("id")
      .single(),
  );
  ok(await ana.client.rpc("set_opening_balance", { p_kind: "account", p_amount: 850_000 }));
  ok(await ana.client.rpc("set_opening_balance", { p_kind: "cash", p_amount: 120_000 }));

  anaRows.pockets = await pocketId(ana, "account");
  anaRows.categories = await categoryId(ana, "Vivienda");
  anaRows.movements = ok(
    await ana.client.from("movements").select("id").eq("pocket_id", anaRows.pockets).single(),
  ).id;
  anaRows.fixed_expenses = ok(
    await ana.client
      .from("fixed_expenses")
      .insert({ name: "Arriendo", amount: 700_000, due_day: 5, category_id: anaRows.categories })
      .select("id")
      .single(),
  ).id;
  anaRows.credit_cards = ok(
    await ana.client.rpc("save_credit_card", {
      p_statement_day: 15,
      p_payment_day: 30,
      p_monthly_rate: 3,
      p_rate_is_estimated: true,
      p_debt: 1_350_000,
    }),
  );
  anaRows.installment_plans = ok(
    await ana.client
      .from("installment_plans")
      .insert({
        credit_card_id: anaRows.credit_cards,
        kind: "advance",
        name: "Avance",
        principal: 960_000,
        installments_count: 8,
        is_initial: true,
      })
      .select("id")
      .single(),
  ).id;
  anaRows.debts = ok(
    await ana.client
      .from("debts")
      .insert({
        name: "Préstamo",
        original_amount: 900_000,
        installment_amount: 150_000,
        payment_day: 30,
        installments_remaining: 6,
      })
      .select("id")
      .single(),
  ).id;
  anaRows.goals = ok(
    await ana.client
      .from("goals")
      .insert({ name: "Viaje", target_amount: 3_000_000, target_date: "2027-12-31" })
      .select("id")
      .single(),
  ).id;
});

afterAll(deleteTestUsers);

describe("datos de arranque", () => {
  it("una cuenta nueva nace con cuenta y efectivo, sin bolsillo de tarjeta", async () => {
    const { data } = await beto.client.from("pockets").select("kind, name").order("kind");
    expect(data).toEqual([
      { kind: "account", name: "Cuenta" },
      { kind: "cash", name: "Efectivo" },
    ]);
  });

  it("y con las categorías de arranque", async () => {
    const { data } = await beto.client.from("categories").select("kind, name");
    const names = (kind: string) =>
      data!
        .filter((category) => category.kind === kind)
        .map((category) => category.name)
        .sort();
    expect(names("expense")).toEqual(
      [
        "Ahorro",
        "Comida",
        "Deudas",
        "Educación",
        "Entretenimiento",
        "Otros",
        "Salud",
        "Servicios",
        "Transporte",
        "Vivienda",
      ].sort(),
    );
    expect(names("income")).toEqual(["Otros ingresos", "Salario"]);
  });

  it("el perfil arranca en el paso 0, sin ingreso y con pagos el 15 y el 30", async () => {
    const { data } = await beto.client
      .from("profiles")
      .select("monthly_income, pay_days, onboarding_step, onboarding_completed")
      .single();
    expect(data).toEqual({
      monthly_income: null,
      pay_days: [15, 30],
      onboarding_step: 0,
      onboarding_completed: false,
    });
  });
});

describe.each(OWNED_TABLES)("acceso cruzado en %s", (table) => {
  it("el dueño ve su fila", async () => {
    const { data } = await ana.client.from(table).select("id").eq("id", anaRows[table]);
    expect(data).toEqual([{ id: anaRows[table] }]);
  });

  it("otro usuario no la ve, ni pidiéndola por su id", async () => {
    const all = await beto.client.from(table).select("id, user_id");
    expect(all.error).toBeNull();
    expect(all.data!.every((row) => row.user_id === beto.id)).toBe(true);

    const byId = await beto.client.from(table).select("id").eq("id", anaRows[table]);
    expect(byId.data).toEqual([]);
  });

  it("otro usuario no la puede cambiar ni borrar", async () => {
    const before = ok(await admin.from(table).select("*").eq("id", anaRows[table]).single());

    // Cambiar el dueño es la forma más directa de robar una fila.
    const update = await beto.client
      .from(table)
      .update({ user_id: beto.id } as never)
      .eq("id", anaRows[table])
      .select("id");
    expect(update.data ?? []).toEqual([]);

    const remove = await beto.client.from(table).delete().eq("id", anaRows[table]).select("id");
    expect(remove.data ?? []).toEqual([]);

    expect(ok(await admin.from(table).select("*").eq("id", anaRows[table]).single())).toEqual(
      before,
    );
  });

  it("sin sesión no se lee nada", async () => {
    const { data, error } = await anonymousClient().from(table).select("id");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });
});

describe("nadie crea filas a nombre de otro", () => {
  it("un gasto fijo con el dueño cambiado se rechaza", async () => {
    const { error } = await beto.client.from("fixed_expenses").insert({
      user_id: ana.id,
      name: "Intruso",
      amount: 1,
      due_day: 1,
      category_id: anaRows.categories,
    });
    expect(error?.code).toBe("42501");
  });

  it("una deuda y una meta con el dueño cambiado se rechazan", async () => {
    const debt = await beto.client.from("debts").insert({
      user_id: ana.id,
      name: "Intruso",
      original_amount: 10,
      installment_amount: 1,
      payment_day: 1,
      installments_remaining: 1,
    });
    const goal = await beto.client
      .from("goals")
      .insert({ user_id: ana.id, name: "Intruso", target_amount: 1, target_date: "2027-01-31" });
    expect(debt.error?.code).toBe("42501");
    expect(goal.error?.code).toBe("42501");
  });
});

describe("una fila propia no puede apuntar a filas de otro", () => {
  it("un gasto fijo no puede usar la categoría de otro usuario", async () => {
    const { error } = await beto.client.from("fixed_expenses").insert({
      name: "Con categoría ajena",
      amount: 1_000,
      due_day: 1,
      category_id: anaRows.categories,
    });
    expect(error?.code).toBe("23503");
  });

  it("un movimiento no puede entrar al bolsillo de otro usuario", async () => {
    const { error } = await beto.client.from("movements").insert({
      kind: "income",
      amount: 1_000,
      occurred_on: "2026-11-16",
      pocket_id: anaRows.pockets,
    });
    expect(error?.code).toBe("23503");
  });

  it("una cuota no puede colgarse de la tarjeta de otro usuario", async () => {
    const { error } = await beto.client.from("installment_plans").insert({
      credit_card_id: anaRows.credit_cards,
      kind: "purchase",
      name: "Ajena",
      principal: 1_000,
      installments_count: 1,
    });
    expect(error?.code).toBe("23503");
  });
});

describe("saldos iniciales", () => {
  it("quedan como un ingreso de saldo inicial en cada bolsillo", async () => {
    const { data } = await ana.client
      .from("movements")
      .select("kind, origin, amount, pockets!movements_user_id_pocket_id_fkey(kind)")
      .in("pocket_id", [anaRows.pockets, await pocketId(ana, "cash")])
      .order("amount", { ascending: false });
    expect(data).toEqual([
      { kind: "income", origin: "opening_balance", amount: 850_000, pockets: { kind: "account" } },
      { kind: "income", origin: "opening_balance", amount: 120_000, pockets: { kind: "cash" } },
    ]);
  });

  it("volver a fijarlo reemplaza el anterior, y con cero no deja movimiento", async () => {
    const cash = await pocketId(beto, "cash");
    const amounts = async () =>
      ok(await beto.client.from("movements").select("amount").eq("pocket_id", cash)).map(
        (movement) => movement.amount,
      );

    ok(await beto.client.rpc("set_opening_balance", { p_kind: "cash", p_amount: 50_000 }));
    ok(await beto.client.rpc("set_opening_balance", { p_kind: "cash", p_amount: 80_000 }));
    expect(await amounts()).toEqual([80_000]);

    ok(await beto.client.rpc("set_opening_balance", { p_kind: "cash", p_amount: 0 }));
    expect(await amounts()).toEqual([]);
  });

  it("rechaza un saldo negativo y un bolsillo que la persona no tiene", async () => {
    const negative = await beto.client.rpc("set_opening_balance", {
      p_kind: "cash",
      p_amount: -1,
    });
    expect(negative.error?.code).toBe("23514");

    // Beto no ha registrado tarjeta, así que no tiene ese bolsillo.
    const noCard = await beto.client.rpc("set_opening_balance", {
      p_kind: "credit_card",
      p_amount: 1_000,
    });
    expect(noCard.error).not.toBeNull();
  });

  it("no se puede duplicar el saldo inicial escribiendo el movimiento a mano", async () => {
    const { error } = await ana.client.from("movements").insert({
      kind: "income",
      origin: "opening_balance",
      amount: 5,
      occurred_on: "2026-11-16",
      pocket_id: anaRows.pockets,
    });
    expect(error?.code).toBe("23505");
  });

  it("sin sesión no se puede llamar", async () => {
    const { error } = await anonymousClient().rpc("set_opening_balance", {
      p_kind: "cash",
      p_amount: 1,
    });
    expect(error).not.toBeNull();
  });
});

describe("tarjeta de crédito", () => {
  it("guardarla crea su bolsillo y deja lo que se debe como deuda inicial", async () => {
    const pocket = await pocketId(ana, "credit_card");
    const { data } = await ana.client
      .from("movements")
      .select("kind, origin, amount")
      .eq("pocket_id", pocket);
    expect(data).toEqual([{ kind: "expense", origin: "opening_balance", amount: 1_350_000 }]);
  });

  it("guardarla otra vez la actualiza: sigue habiendo una sola", async () => {
    const id = ok(
      await ana.client.rpc("save_credit_card", {
        p_statement_day: 10,
        p_payment_day: 25,
        p_monthly_rate: 2.1,
        p_rate_is_estimated: false,
        p_debt: 1_350_000,
      }),
    );
    expect(id).toBe(anaRows.credit_cards);

    const { data } = await ana.client
      .from("credit_cards")
      .select("statement_day, payment_day, monthly_rate, rate_is_estimated");
    expect(data).toEqual([
      { statement_day: 10, payment_day: 25, monthly_rate: 2.1, rate_is_estimated: false },
    ]);
    // Y las cuotas en curso siguen ahí.
    const plans = await ana.client.from("installment_plans").select("id");
    expect(plans.data).toEqual([{ id: anaRows.installment_plans }]);
  });

  it("sin tasa escrita queda en 3 % y marcada como estimada", async () => {
    const carla = await createTestUser("Carla");
    ok(
      await carla.client.rpc("save_credit_card", {
        p_statement_day: 15,
        p_payment_day: 30,
        p_monthly_rate: 3,
        p_rate_is_estimated: true,
        p_debt: 0,
      }),
    );
    const card = ok(
      await carla.client.from("credit_cards").select("monthly_rate, rate_is_estimated").single(),
    );
    expect(card).toEqual({ monthly_rate: 3, rate_is_estimated: true });
    // Sin deuda, el bolsillo existe pero no tiene movimientos.
    const pocket = await pocketId(carla, "credit_card");
    const movements = await carla.client.from("movements").select("id").eq("pocket_id", pocket);
    expect(movements.data).toEqual([]);
  });

  it("rechaza días y tasas imposibles", async () => {
    const save = (changes: object) =>
      beto.client.rpc("save_credit_card", {
        p_statement_day: 15,
        p_payment_day: 30,
        p_monthly_rate: 3,
        p_rate_is_estimated: true,
        p_debt: 0,
        ...changes,
      });
    expect((await save({ p_statement_day: 32 })).error?.code).toBe("23514");
    expect((await save({ p_payment_day: 0 })).error?.code).toBe("23514");
    expect((await save({ p_monthly_rate: 16 })).error?.code).toBe("23514");
    // Nada quedó a medias: Beto sigue sin tarjeta ni bolsillo de tarjeta.
    expect((await beto.client.from("credit_cards").select("id")).data).toEqual([]);
    expect((await beto.client.from("pockets").select("id").eq("kind", "credit_card")).data).toEqual(
      [],
    );
  });
});

describe("reglas de los datos", () => {
  it.each([
    ["valor en cero", { amount: 0 }],
    ["valor negativo", { amount: -5 }],
    ["día 0", { due_day: 0 }],
    ["día 32", { due_day: 32 }],
    ["nombre vacío", { name: "" }],
  ])("un gasto fijo con %s se rechaza", async (_caso, change) => {
    const { error } = await ana.client.from("fixed_expenses").insert({
      name: "Prueba",
      amount: 1_000,
      due_day: 5,
      category_id: anaRows.categories,
      ...change,
    });
    expect(error?.code).toBe("23514");
  });

  it("un gasto fijo acepta el día 31 y las tres formas de repartirlo", async () => {
    for (const split of ["first", "second", "half"] as const) {
      const { error } = await beto.client.from("fixed_expenses").insert({
        name: `Día 31 ${split}`,
        amount: 1_000,
        due_day: 31,
        split,
        category_id: await categoryId(beto, "Otros"),
      });
      expect(error).toBeNull();
    }
  });

  it("los montos son enteros: un decimal se rechaza", async () => {
    const { error } = await ana.client
      .from("goals")
      .insert({ name: "Decimal", target_amount: 1000.5, target_date: "2027-01-31" });
    expect(error?.code).toBe("22P02");
  });

  it("un traslado exige destino, y que no sea el mismo bolsillo", async () => {
    const base = { kind: "transfer" as const, amount: 1_000, occurred_on: "2026-11-16" };
    const noTarget = await ana.client
      .from("movements")
      .insert({ ...base, pocket_id: anaRows.pockets });
    const sameTarget = await ana.client
      .from("movements")
      .insert({ ...base, pocket_id: anaRows.pockets, to_pocket_id: anaRows.pockets });
    expect(noTarget.error?.code).toBe("23514");
    expect(sameTarget.error?.code).toBe("23514");
  });

  it.each([
    ["quincenal con un solo día", { pay_frequency: "biweekly", pay_days: [15] }],
    ["mensual con dos días", { pay_frequency: "monthly", pay_days: [15, 30] }],
    ["días en desorden", { pay_frequency: "biweekly", pay_days: [30, 15] }],
    ["días repetidos", { pay_frequency: "biweekly", pay_days: [15, 15] }],
    ["día 32", { pay_frequency: "monthly", pay_days: [32] }],
    ["ingreso en cero", { monthly_income: 0 }],
    ["paso 7", { onboarding_step: 7 }],
  ] as const)("el perfil rechaza %s", async (_caso, change) => {
    const { error } = await beto.client
      .from("profiles")
      .update(change as never)
      .eq("id", beto.id);
    expect(error?.code).toBe("23514");
  });

  it("el perfil acepta pago mensual con un día", async () => {
    const { error } = await beto.client
      .from("profiles")
      .update({ pay_frequency: "monthly", pay_days: [31], monthly_income: 2_000_000 })
      .eq("id", beto.id);
    expect(error).toBeNull();
  });

  it("las categorías y los bolsillos no se pueden cambiar ni borrar desde la app", async () => {
    const rename = await ana.client
      .from("categories")
      .update({ name: "Otra" })
      .eq("id", anaRows.categories);
    const removeCategory = await ana.client
      .from("categories")
      .delete()
      .eq("id", anaRows.categories);
    const removePocket = await ana.client.from("pockets").delete().eq("id", anaRows.pockets);
    expect(rename.error?.code).toBe("42501");
    expect(removeCategory.error?.code).toBe("42501");
    expect(removePocket.error?.code).toBe("42501");
  });
});

describe("recorridos", () => {
  it("mínimo: con ingreso y saldos ya se puede terminar", async () => {
    const dani = await createTestUser("Dani");
    ok(
      await dani.client
        .from("profiles")
        .update({ monthly_income: 1_800_000, onboarding_step: 2 })
        .eq("id", dani.id)
        .select("id")
        .single(),
    );
    ok(await dani.client.rpc("set_opening_balance", { p_kind: "account", p_amount: 300_000 }));
    ok(
      await dani.client
        .from("profiles")
        .update({ onboarding_step: 6, onboarding_completed: true })
        .eq("id", dani.id)
        .select("id")
        .single(),
    );

    const profile = ok(await admin.from("profiles").select("*").eq("id", dani.id).single());
    expect(profile).toMatchObject({ monthly_income: 1_800_000, onboarding_completed: true });
    for (const table of ["fixed_expenses", "credit_cards", "debts", "goals"] as const) {
      expect((await dani.client.from(table).select("id")).data).toEqual([]);
    }
  });

  it("completo: todo lo de Ana quedó guardado, y al borrar su cuenta se va todo", async () => {
    const eva = await createTestUser("Eva");
    ok(await eva.client.rpc("set_opening_balance", { p_kind: "account", p_amount: 10_000 }));
    ok(
      await eva.client.rpc("save_credit_card", {
        p_statement_day: 15,
        p_payment_day: 30,
        p_monthly_rate: 3,
        p_rate_is_estimated: true,
        p_debt: 50_000,
      }),
    );
    ok(
      await eva.client
        .from("goals")
        .insert({ name: "Meta", target_amount: 1_000, target_date: "2027-06-30" })
        .select("id")
        .single(),
    );

    await admin.auth.admin.deleteUser(eva.id);
    for (const table of OWNED_TABLES) {
      const { data } = await admin.from(table).select("id").eq("user_id", eva.id);
      expect(data).toEqual([]);
    }
  });
});

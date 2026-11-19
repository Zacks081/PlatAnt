import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { admin, createTestUser, deleteTestUsers } from "./local-supabase";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
type Split = "first" | "second" | "half";

let ana: TestUser;
let beto: TestUser;
const categories = new Map<string, string>();

function ok<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}

async function account(user: TestUser = ana) {
  const rows = ok(await user.client.rpc("pocket_balances"));
  return Number(rows.find((row) => row.kind === "account")?.balance ?? 0);
}

/**
 * Un gasto fijo. Por defecto «existe desde enero», para que la fecha en que se creó no cuente;
 * las pruebas de gastos creados a mitad de quincena le ponen su fecha.
 */
async function fixed(
  name: string,
  amount: number,
  dueDay: number,
  split: Split,
  { user = ana, createdAt = "2026-01-01T12:00:00Z" } = {},
) {
  const row = ok(
    await user.client
      .from("fixed_expenses")
      .insert({
        name,
        amount,
        due_day: dueDay,
        split,
        category_id: categories.get(`${user.id}:Servicios`)!,
        created_at: createdAt,
      })
      .select("id")
      .single(),
  );
  return row.id;
}

/** «Me pagaron»: mes del pago del calendario, cuál del mes, cuándo llegó y cuándo llega el otro. */
function pay(
  month: string,
  slot: 1 | 2,
  receivedOn: string,
  expectedEnd: string,
  { user = ana, amount = 1_200_000 } = {},
) {
  return user.client.rpc("open_pay_period", {
    p_amount: amount,
    p_received_on: receivedOn,
    p_pay_month: `${month}-01`,
    p_pay_slot: slot,
    p_expected_end_on: expectedEnd,
  });
}

/** Los apartados de una quincena, como [nombre, vencimiento, valor]. */
async function setAsides(periodId: string, user = ana) {
  const rows = ok(
    await user.client
      .from("set_asides")
      .select("amount, due_on, paid_movement_id, fixed_expenses(name)")
      .eq("pay_period_id", periodId)
      .order("due_on")
      .order("amount"),
  );
  return rows.map((row) => [row.fixed_expenses?.name, row.due_on, row.amount]);
}

beforeAll(async () => {
  [ana, beto] = await Promise.all([createTestUser("Ana"), createTestUser("Beto")]);
  ok(await ana.client.rpc("set_opening_balance", { p_kind: "account", p_amount: 500_000 }));
  for (const user of [ana, beto]) {
    const rows = ok(await user.client.from("categories").select("id, name"));
    for (const row of rows) categories.set(`${user.id}:${row.name}`, row.id);
  }
});

/** Cada prueba arranca sin quincenas, sin gastos fijos y con 500.000 en la cuenta. */
beforeEach(async () => {
  for (const user of [ana, beto]) {
    await admin.from("pay_periods").delete().eq("user_id", user.id);
    await admin.from("movements").delete().eq("user_id", user.id).neq("origin", "opening_balance");
    await admin.from("fixed_expenses").delete().eq("user_id", user.id);
  }
  await admin
    .from("profiles")
    .update({ pay_frequency: "monthly", pay_days: [30] })
    .eq("id", beto.id);
});

afterAll(deleteTestUsers);

describe("Me pagaron", () => {
  it("registra el ingreso en la cuenta con la fecha y el valor escritos", async () => {
    const id = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30", { amount: 1_150_000 }));
    expect(await account()).toBe(1_650_000);

    const period = ok(
      await ana.client
        .from("pay_periods")
        .select(
          "started_on, amount_received, expected_end_on, movements!pay_periods_user_id_movement_id_fkey(kind, origin, amount, occurred_on, categories(name))",
        )
        .eq("id", id)
        .single(),
    );
    expect(period).toEqual({
      started_on: "2026-09-15",
      amount_received: 1_150_000,
      expected_end_on: "2026-09-30",
      movements: {
        kind: "income",
        origin: "payday",
        amount: 1_150_000,
        occurred_on: "2026-09-15",
        categories: { name: "Salario" },
      },
    });
  });

  it("no abre dos quincenas para el mismo pago, ni para uno anterior", async () => {
    ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    expect((await pay("2026-09", 2, "2026-10-01", "2026-10-15")).error?.code).toBe("PA409");
    expect((await pay("2026-09", 1, "2026-09-30", "2026-10-15")).error?.code).toBe("PA409");
    expect(await account()).toBe(1_700_000);
  });

  it("el pago siguiente no puede tener fecha antes del anterior", async () => {
    ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    expect((await pay("2026-10", 1, "2026-09-29", "2026-10-30")).error?.code).toBe("23514");
  });

  it("no acepta un pago que no existe con los días de pago del usuario", async () => {
    const { error } = await pay("2026-09", 2, "2026-09-30", "2026-10-30", { user: beto });
    expect(error?.code).toBe("23514");
  });
});

describe("reparto de los gastos fijos", () => {
  it("primera quincena: se aparta del pago del 15 para el vencimiento siguiente", async () => {
    await fixed("Internet", 80_000, 20, "first");
    await fixed("Arriendo", 350_000, 5, "first");

    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    // El internet del 20 de septiembre y el arriendo del 5 de octubre.
    expect(await setAsides(sep15)).toEqual([
      ["Internet", "2026-09-20", 80_000],
      ["Arriendo", "2026-10-05", 350_000],
    ]);

    // La quincena del 30 no aparta nada de la primera.
    const sep30 = ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    expect(await setAsides(sep30)).toEqual([]);

    const oct15 = ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));
    expect(await setAsides(oct15)).toEqual([
      ["Internet", "2026-10-20", 80_000],
      ["Arriendo", "2026-11-05", 350_000],
    ]);
  });

  it("segunda quincena: se aparta del pago del 30", async () => {
    await fixed("Agua", 60_000, 10, "second");

    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    expect(await setAsides(sep15)).toEqual([]);
    const sep30 = ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    expect(await setAsides(sep30)).toEqual([["Agua", "2026-10-10", 60_000]]);
  });

  it("mitad y mitad: cada pago aparta la mitad, y entre los dos suman el valor exacto", async () => {
    await fixed("Celular", 50_001, 25, "half");

    const sep30 = ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    const oct15 = ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));
    // El celular del 25 de octubre: una parte del pago del 30 y otra del pago del 15.
    expect(await setAsides(oct15)).toEqual([["Celular", "2026-10-25", 25_000]]);
    expect((await setAsides(sep30)).filter((row) => row[1] === "2026-10-25")).toEqual([
      ["Celular", "2026-10-25", 25_001],
    ]);
  });

  it("la primera quincena también aparta lo que vence antes del pago siguiente", async () => {
    await fixed("Celular", 50_000, 25, "half");
    await fixed("Luz", 90_000, 20, "second");

    // Sin una quincena anterior que haya apartado su parte, la primera aparta todo.
    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    expect(await setAsides(sep15)).toEqual([
      ["Luz", "2026-09-20", 90_000],
      ["Celular", "2026-09-25", 50_000],
    ]);
  });

  it("con pago mensual todo sale del único pago", async () => {
    await fixed("Arriendo", 300_000, 5, "first", { user: beto });
    await fixed("Gimnasio", 70_000, 28, "half", { user: beto });

    const sep = ok(await pay("2026-09", 1, "2026-09-30", "2026-10-30", { user: beto }));
    expect(await setAsides(sep, beto)).toEqual([
      ["Arriendo", "2026-10-05", 300_000],
      ["Gimnasio", "2026-10-28", 70_000],
    ]);
  });

  it("un gasto del 31 se aparta para el último día de los meses cortos", async () => {
    await fixed("Seguro", 40_000, 31, "second");
    const sep30 = ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    expect(await setAsides(sep30)).toEqual([["Seguro", "2026-09-30", 40_000]]);
  });

  it("un pago atrasado igual aparta lo que vencía mientras llegaba", async () => {
    await fixed("Seguro", 40_000, 30, "second");
    // El pago del 30 de septiembre llegó el 2 de octubre.
    const late = ok(await pay("2026-09", 2, "2026-10-02", "2026-10-15"));
    expect(await setAsides(late)).toEqual([["Seguro", "2026-09-30", 40_000]]);
  });

  it("si no se registró un pago, el siguiente aparta lo que le tocaba", async () => {
    await fixed("Agua", 60_000, 10, "second");
    await fixed("Internet", 80_000, 20, "first");
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    // Se saltó el pago del 30 de septiembre: el agua del 10 de octubre queda en esta quincena.
    const oct15 = ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));
    expect(await setAsides(oct15)).toEqual([
      ["Agua", "2026-10-10", 60_000],
      ["Internet", "2026-10-20", 80_000],
    ]);
  });
});

describe("gastos fijos que cambian durante la quincena", () => {
  it("uno creado a mitad de quincena se aparta desde la quincena que le corresponde", async () => {
    ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    const oct15 = ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));

    // Creado el 20 de octubre, vence el 25 y va mitad y mitad: la parte del pago del 30 ya no
    // alcanzó a apartarse, así que esta quincena aparta todo.
    await fixed("Gimnasio", 100_000, 25, "half", { createdAt: "2026-10-20T15:00:00Z" });
    // Creado el 20, vence el 18: este mes ya pasó, empieza en el pago del 15 de noviembre.
    await fixed("Revista", 20_000, 18, "first", { createdAt: "2026-10-20T15:00:00Z" });
    // Vence el 5 y sale del pago del 30: empieza con ese pago.
    await fixed("Arriendo", 350_000, 5, "second", { createdAt: "2026-10-20T15:00:00Z" });

    expect(await setAsides(oct15)).toEqual([["Gimnasio", "2026-10-25", 100_000]]);

    const oct30 = ok(await pay("2026-10", 2, "2026-10-30", "2026-11-13"));
    expect(await setAsides(oct30)).toEqual([
      ["Arriendo", "2026-11-05", 350_000],
      ["Gimnasio", "2026-11-25", 50_000],
    ]);
  });

  it("si cambia el valor o el día, lo pendiente se ajusta", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));

    ok(
      await ana.client.from("fixed_expenses").update({ amount: 95_000 }).eq("id", id).select("id"),
    );
    expect(await setAsides(sep15)).toEqual([["Internet", "2026-09-20", 95_000]]);

    ok(await ana.client.from("fixed_expenses").update({ due_day: 22 }).eq("id", id).select("id"));
    expect(await setAsides(sep15)).toEqual([["Internet", "2026-09-22", 95_000]]);
  });

  it("si se borra el gasto fijo, deja de estar apartado", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    ok(await ana.client.from("fixed_expenses").delete().eq("id", id).select("id"));
    expect(await setAsides(sep15)).toEqual([]);
  });
});

/** Saldo del bolsillo de un gasto fijo. */
async function pocket(fixedExpenseId: string, user: TestUser = ana) {
  const row = ok(
    await user.client.from("pockets").select("id").eq("fixed_expense_id", fixedExpenseId).single(),
  );
  return Number(ok(await user.client.rpc("pocket_balance", { p_pocket: row.id })));
}

/** «Pagar» desde el bolsillo. */
function payFixed(fixedExpenseId: string, amount: number, cover = false, user: TestUser = ana) {
  return user.client.rpc("pay_fixed_expense", {
    p_fixed_expense: fixedExpenseId,
    p_amount: amount,
    p_occurred_on: "2026-11-18",
    p_cover_from_account: cover,
  });
}

/** Apartar (`into`) o sacar del bolsillo. */
function move(fixedExpenseId: string, amount: number, into: boolean) {
  return ana.client.rpc("move_fixed_pocket", {
    p_fixed_expense: fixedExpenseId,
    p_amount: amount,
    p_occurred_on: "2026-09-10",
    p_into_pocket: into,
  });
}

describe("bolsillos de los gastos fijos", () => {
  it("cada gasto fijo tiene su bolsillo, que sigue su nombre", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    ok(await ana.client.from("fixed_expenses").update({ name: "Fibra" }).eq("id", id).select("id"));
    const row = ok(
      await ana.client.from("pockets").select("kind, name").eq("fixed_expense_id", id).single(),
    );
    expect(row).toEqual({ kind: "fixed_expense", name: "Fibra" });
    expect(await pocket(id)).toBe(0);
  });

  it("al registrar el pago, la quincena pasa a cada bolsillo lo que le toca", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));

    expect(await pocket(id)).toBe(80_000);
    expect(await account()).toBe(500_000 + 1_200_000 - 80_000);
    const moved = ok(
      await ana.client
        .from("movements")
        .select("kind, origin, amount, occurred_on, pay_period_id")
        .eq("origin", "set_aside"),
    );
    expect(moved).toEqual([
      {
        kind: "transfer",
        origin: "set_aside",
        amount: 80_000,
        occurred_on: "2026-09-15",
        pay_period_id: sep15,
      },
    ]);
  });

  it("mitad y mitad: cada quincena pasa su mitad", async () => {
    const id = await fixed("Celular", 50_000, 25, "half");
    ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    expect(await pocket(id)).toBe(25_000);
    ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));
    expect(await pocket(id)).toBe(50_000);
  });

  it("si el bolsillo ya tiene plata, la quincena aparta solo lo que falta", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    ok(await move(id, 30_000, true));
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    expect(await pocket(id)).toBe(80_000);
    expect(await account()).toBe(500_000 + 1_200_000 - 80_000);
  });

  it("se aparta y se saca a mano, pero no más de lo que tiene", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    expect((await move(id, 90_000, false)).error?.code).toBe("PA402");
    ok(await move(id, 30_000, false));
    expect(await pocket(id)).toBe(50_000);
    ok(await move(id, 10_000, true));
    expect(await pocket(id)).toBe(60_000);
    expect(await account()).toBe(500_000 + 1_200_000 - 60_000);
  });

  it("pagar registra «Pago …» desde el bolsillo y marca el vencimiento como pagado", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    const movementId = ok(await payFixed(id, 80_000));

    const movement = ok(
      await ana.client
        .from("movements")
        .select(
          "kind, origin, amount, description, category_id, pockets!movements_user_id_pocket_id_fkey(kind)",
        )
        .eq("id", movementId)
        .single(),
    );
    expect(movement).toEqual({
      kind: "expense",
      origin: "manual",
      amount: 80_000,
      description: "Pago Internet",
      category_id: categories.get(`${ana.id}:Servicios`),
      pockets: { kind: "fixed_expense" },
    });
    expect(await pocket(id)).toBe(0);
    const row = ok(
      await ana.client
        .from("set_asides")
        .select("paid_movement_id")
        .eq("pay_period_id", sep15)
        .single(),
    );
    expect(row.paid_movement_id).toBe(movementId);
  });

  it("si el bolsillo no alcanza, avisa; con permiso, lo que falta sale de la cuenta", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    const before = await account();

    const { error } = await payFixed(id, 100_000);
    expect(error?.code).toBe("PA402");
    expect(error?.details).toBe("20000");
    expect(await pocket(id)).toBe(80_000);

    ok(await payFixed(id, 100_000, true));
    expect(await pocket(id)).toBe(0);
    expect(await account()).toBe(before - 20_000);
  });

  it("lo que sobra se queda en el bolsillo y el mes siguiente aparta menos", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    ok(await payFixed(id, 70_000));
    expect(await pocket(id)).toBe(10_000);

    ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));
    expect(await pocket(id)).toBe(80_000);
  });

  it("pagar antes de tiempo un gasto mitad y mitad no lo vuelve a apartar después", async () => {
    const id = await fixed("Celular", 50_000, 25, "half");
    ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    ok(await payFixed(id, 50_000, true));

    const oct15 = ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));
    expect(await setAsides(oct15)).toEqual([]);
    expect(await pocket(id)).toBe(0);
  });

  it("al pagar, todas las partes de ese vencimiento quedan pagadas", async () => {
    const id = await fixed("Celular", 50_000, 25, "half");
    const sep30 = ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    const oct15 = ok(await pay("2026-10", 1, "2026-10-15", "2026-10-30"));
    const movementId = ok(await payFixed(id, 50_000));

    const rows = ok(
      await ana.client
        .from("set_asides")
        .select("pay_period_id, amount, paid_movement_id")
        .eq("due_on", "2026-10-25")
        .order("created_at"),
    );
    expect(rows).toEqual([
      { pay_period_id: sep30, amount: 25_000, paid_movement_id: movementId },
      { pay_period_id: oct15, amount: 25_000, paid_movement_id: movementId },
    ]);
  });

  it("si se borra el pago, el vencimiento vuelve a pendiente y la plata al bolsillo", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    const sep15 = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    const movementId = ok(await payFixed(id, 80_000));
    ok(await ana.client.from("movements").delete().eq("id", movementId).select("id"));

    expect(await pocket(id)).toBe(80_000);
    const row = ok(
      await ana.client
        .from("set_asides")
        .select("paid_movement_id")
        .eq("pay_period_id", sep15)
        .single(),
    );
    expect(row.paid_movement_id).toBeNull();
  });

  it("al borrar el gasto fijo, su plata vuelve a la cuenta y el bolsillo se archiva", async () => {
    const id = await fixed("Internet", 80_000, 20, "first");
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    const before = await account();
    const { data: row } = await ana.client
      .from("pockets")
      .select("id")
      .eq("fixed_expense_id", id)
      .single();

    ok(await ana.client.from("fixed_expenses").delete().eq("id", id).select("id"));
    expect(await account()).toBe(before + 80_000);
    const archived = ok(
      await ana.client
        .from("pockets")
        .select("archived_at, fixed_expense_id")
        .eq("id", row!.id)
        .single(),
    );
    expect(archived.fixed_expense_id).toBeNull();
    expect(archived.archived_at).not.toBeNull();
  });

  it("primer pago: si lo de antes ya estaba apartado, entra como saldo inicial del bolsillo", async () => {
    const id = await fixed("Gasolina", 120_000, 30, "half");
    const first = (extra: Record<string, boolean>) =>
      ana.client.rpc("open_pay_period", {
        p_amount: 1_100_000,
        p_received_on: "2026-11-18",
        p_pay_month: "2026-11-01",
        p_pay_slot: 2,
        p_expected_end_on: "2026-12-15",
        ...extra,
      });

    const asked = await first({ p_ask_prior: true });
    expect(asked.error?.code).toBe("PA428");
    expect(asked.error?.details).toBe("60000");
    expect(await pocket(id)).toBe(0);

    ok(await first({ p_prior_covered: true }));
    expect(await pocket(id)).toBe(120_000);
    // Del pago solo salió su mitad; la otra ya la tenía.
    expect(await account()).toBe(500_000 + 1_100_000 - 60_000);
  });

  it("primer pago: si no estaba apartado, el pago aparta todo", async () => {
    const id = await fixed("Gasolina", 120_000, 30, "half");
    ok(
      await ana.client.rpc("open_pay_period", {
        p_amount: 1_100_000,
        p_received_on: "2026-11-18",
        p_pay_month: "2026-11-01",
        p_pay_slot: 2,
        p_expected_end_on: "2026-12-15",
        p_prior_covered: false,
      }),
    );
    expect(await pocket(id)).toBe(120_000);
    expect(await account()).toBe(500_000 + 1_100_000 - 120_000);
  });
});

describe("corregir o borrar un pago", () => {
  it("se corrige el valor y la fecha del último pago", async () => {
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    const id = ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    ok(
      await ana.client.rpc("update_pay_period", {
        p_id: id,
        p_amount: 1_000_000,
        p_received_on: "2026-09-29",
      }),
    );

    const period = ok(
      await ana.client
        .from("pay_periods")
        .select(
          "started_on, amount_received, movements!pay_periods_user_id_movement_id_fkey(amount, occurred_on)",
        )
        .eq("id", id)
        .single(),
    );
    expect(period).toEqual({
      started_on: "2026-09-29",
      amount_received: 1_000_000,
      movements: { amount: 1_000_000, occurred_on: "2026-09-29" },
    });
  });

  it("solo se corrige o se borra el último", async () => {
    const first = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    ok(await pay("2026-09", 2, "2026-09-30", "2026-10-15"));
    const update = await ana.client.rpc("update_pay_period", {
      p_id: first,
      p_amount: 1,
      p_received_on: "2026-09-15",
    });
    expect(update.error?.code).toBe("PA409");
    expect((await ana.client.rpc("delete_pay_period", { p_id: first })).error?.code).toBe("PA409");
  });

  it("borrar el pago quita el ingreso, la quincena, sus apartados y lo que pasó a los bolsillos", async () => {
    const internet = await fixed("Internet", 80_000, 20, "first");
    const id = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    ok(await ana.client.rpc("delete_pay_period", { p_id: id }));

    expect(await account()).toBe(500_000);
    expect(await pocket(internet)).toBe(0);
    expect(ok(await ana.client.from("pay_periods").select("id"))).toEqual([]);
    expect(ok(await ana.client.from("set_asides").select("id"))).toEqual([]);
  });

  it("no se borra un pago con el que ya se pagó algo", async () => {
    const internet = await fixed("Internet", 80_000, 20, "first");
    const id = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));
    ok(await payFixed(internet, 80_000));
    expect((await ana.client.rpc("delete_pay_period", { p_id: id })).error?.code).toBe("PA423");
  });
});

describe("cada usuario, lo suyo", () => {
  it("nadie ve ni paga las quincenas de otro", async () => {
    const internet = await fixed("Internet", 80_000, 20, "first");
    const id = ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30"));

    expect(ok(await beto.client.from("pay_periods").select("id"))).toEqual([]);
    expect(ok(await beto.client.from("set_asides").select("id"))).toEqual([]);
    expect((await payFixed(internet, 80_000, true, beto)).error?.code).toBe("P0002");
    expect(
      (
        await beto.client.rpc("move_fixed_pocket", {
          p_fixed_expense: internet,
          p_amount: 1_000,
          p_occurred_on: "2026-09-10",
          p_into_pocket: true,
        })
      ).error?.code,
    ).toBe("P0002");
    expect(await pocket(internet)).toBe(80_000);
    expect((await beto.client.rpc("delete_pay_period", { p_id: id })).error?.code).toBe("PA409");
  });

  it("al borrar una cuenta se van sus quincenas, apartados, bolsillos y pagos", async () => {
    const carla = await createTestUser("Carla");
    const services = ok(
      await carla.client.from("categories").select("id").eq("name", "Servicios").single(),
    );
    const internet = ok(
      await carla.client
        .from("fixed_expenses")
        .insert({
          name: "Internet",
          amount: 80_000,
          due_day: 20,
          split: "first",
          category_id: services.id,
          created_at: "2026-01-01T12:00:00Z",
        })
        .select("id"),
    );
    ok(await pay("2026-09", 1, "2026-09-15", "2026-09-30", { user: carla }));
    ok(await payFixed(internet[0].id, 80_000, false, carla));

    const { error } = await admin.auth.admin.deleteUser(carla.id);
    expect(error).toBeNull();
    for (const table of ["pay_periods", "set_asides", "movements", "pockets"] as const) {
      expect(ok(await admin.from(table).select("id").eq("user_id", carla.id))).toEqual([]);
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  admin,
  anonymousClient,
  createTestUser,
  deleteTestUsers,
  TEST_PASSWORD,
  trackUser,
  uniqueEmail,
} from "./local-supabase";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

let ana: TestUser;
let beto: TestUser;

beforeAll(async () => {
  [ana, beto] = await Promise.all([createTestUser("Ana"), createTestUser("Beto")]);
});

afterAll(deleteTestUsers);

/** Lee un perfil saltando la seguridad por fila, para comprobar qué quedó de verdad. */
async function profileAsAdmin(id: string) {
  const { data, error } = await admin.from("profiles").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

describe("perfil al crear la cuenta", () => {
  it("nace solo, con el nombre del registro y los valores por defecto", async () => {
    expect(await profileAsAdmin(ana.id)).toMatchObject({
      id: ana.id,
      name: "Ana",
      currency: "COP",
      time_zone: "America/Bogota",
      pay_frequency: "biweekly",
      onboarding_completed: false,
    });
  });

  it("limpia los espacios del nombre", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: uniqueEmail("espacios"),
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "  Carla  " },
    });
    expect(error).toBeNull();
    trackUser(data.user!.id);
    expect((await profileAsAdmin(data.user!.id)).name).toBe("Carla");
  });

  it.each([
    ["sin nombre", {}],
    ["con nombre vacío", { name: "" }],
    ["con nombre de solo espacios", { name: "   " }],
  ])("no crea la cuenta %s", async (_caso, metadata) => {
    const email = uniqueEmail("sin-nombre");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (data.user) trackUser(data.user.id);

    expect(error).not.toBeNull();
    // Y no queda una cuenta a medias con la que se pueda entrar.
    const { error: signInError } = await anonymousClient().auth.signInWithPassword({
      email,
      password: TEST_PASSWORD,
    });
    expect(signInError?.code).toBe("invalid_credentials");
  });

  it("al borrar la cuenta se borra su perfil", async () => {
    const temporal = await createTestUser("Temporal");
    await admin.auth.admin.deleteUser(temporal.id);
    const { data } = await admin.from("profiles").select("id").eq("id", temporal.id);
    expect(data).toEqual([]);
  });
});

describe("registro", () => {
  it("rechaza un correo repetido", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: ana.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Otra Ana" },
    });
    expect(error?.code).toBe("email_exists");
  });

  it("está cerrado para quien llama directo al servicio, sin pasar por la app", async () => {
    const email = uniqueEmail("directo");
    const { data, error } = await anonymousClient().auth.signUp({
      email,
      password: TEST_PASSWORD,
      options: { data: { name: "Intruso" } },
    });
    if (data.user) trackUser(data.user.id);

    expect(error?.code).toBe("signup_disabled");
    expect(data.user).toBeNull();
  });
});

describe("acceso cruzado entre usuarios", () => {
  it("cada usuario ve solo su perfil", async () => {
    const { data, error } = await ana.client.from("profiles").select("id, name");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: ana.id, name: "Ana" }]);
  });

  it("no puede leer el perfil de otro, ni pidiéndolo por su id", async () => {
    const { data, error } = await ana.client.from("profiles").select("*").eq("id", beto.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("no puede cambiar el perfil de otro", async () => {
    const { data, error } = await ana.client
      .from("profiles")
      .update({ name: "Hackeado", onboarding_completed: true })
      .eq("id", beto.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await profileAsAdmin(beto.id)).toMatchObject({
      name: "Beto",
      onboarding_completed: false,
    });
  });

  it("un cambio sin filtro solo toca el perfil propio", async () => {
    const { data } = await ana.client
      .from("profiles")
      .update({ currency: "USD" })
      .neq("name", "")
      .select("id");
    expect(data).toEqual([{ id: ana.id }]);
    expect((await profileAsAdmin(beto.id)).currency).toBe("COP");
    await ana.client.from("profiles").update({ currency: "COP" }).eq("id", ana.id);
  });

  it("no puede borrar perfiles, ni el propio ni el de otro", async () => {
    const { error } = await ana.client.from("profiles").delete().in("id", [ana.id, beto.id]);
    expect(error?.code).toBe("42501");
    expect((await profileAsAdmin(ana.id)).id).toBe(ana.id);
    expect((await profileAsAdmin(beto.id)).id).toBe(beto.id);
  });

  it("no puede crear perfiles a mano", async () => {
    const { error } = await ana.client
      .from("profiles")
      .insert({ id: crypto.randomUUID(), name: "Fantasma" });
    expect(error?.code).toBe("42501");
  });

  it("no puede quedarse con el perfil de otro cambiando el id del suyo", async () => {
    const { error } = await ana.client
      .from("profiles")
      // El id no es editable; se fuerza el tipo para probar que la base de datos lo rechaza.
      .update({ id: beto.id } as never)
      .eq("id", ana.id);
    expect(error?.code).toBe("42501");
  });

  it("sin sesión no se lee ni se cambia nada", async () => {
    const anonymous = anonymousClient();

    const read = await anonymous.from("profiles").select("*");
    expect(read.data ?? []).toEqual([]);
    expect(read.error?.code).toBe("42501");

    const write = await anonymous.from("profiles").update({ name: "Nadie" }).eq("id", beto.id);
    expect(write.error?.code).toBe("42501");
    expect((await profileAsAdmin(beto.id)).name).toBe("Beto");
  });
});

describe("cambios al perfil propio", () => {
  it("puede cambiar su nombre, moneda, zona horaria y frecuencia de pago", async () => {
    const before = await profileAsAdmin(beto.id);
    const { data, error } = await beto.client
      .from("profiles")
      .update({ name: "Beto R.", currency: "USD", time_zone: "America/New_York" })
      .eq("id", beto.id)
      .select("name, currency, time_zone, updated_at")
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      name: "Beto R.",
      currency: "USD",
      time_zone: "America/New_York",
    });
    expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );

    await beto.client
      .from("profiles")
      .update({ name: "Beto", currency: "COP", time_zone: "America/Bogota" })
      .eq("id", beto.id);
  });

  it.each([
    ["un nombre vacío", { name: "" }],
    ["un nombre con espacios a los lados", { name: " Beto " }],
    ["una moneda que no es un código de tres letras", { currency: "pesos" }],
    ["una zona horaria que no existe", { time_zone: "Marte/Olympus" }],
  ])("rechaza %s", async (_caso, change) => {
    const { error } = await beto.client.from("profiles").update(change).eq("id", beto.id);
    expect(error?.code).toBe("23514");
  });

  it("rechaza una frecuencia de pago desconocida", async () => {
    const { error } = await beto.client
      .from("profiles")
      .update({ pay_frequency: "weekly" } as never)
      .eq("id", beto.id);
    expect(error?.code).toBe("22P02");
  });

  it("no puede tocar las fechas internas", async () => {
    const { error } = await beto.client
      .from("profiles")
      .update({ created_at: "2000-01-01T00:00:00Z" } as never)
      .eq("id", beto.id);
    expect(error?.code).toBe("42501");
  });
});

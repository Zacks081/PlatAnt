-- Configuración inicial (issue 3): bolsillos, categorías, saldos iniciales, gastos fijos,
-- tarjeta de crédito con sus cuotas en curso, deudas y meta.
--
-- Todas las tablas siguen el patrón de profiles:
--   1. Cada fila tiene dueño (user_id) y nace con el usuario de la sesión.
--   2. La seguridad por fila está activa desde que la tabla nace.
--   3. Solo quien tiene sesión tiene permisos, y solo sobre sus filas.
-- Además, una fila solo puede apuntar a filas del mismo dueño: por eso las relaciones
-- se hacen con (user_id, id) y no solo con id.

create type public.pocket_kind as enum ('account', 'cash', 'credit_card');
create type public.category_kind as enum ('expense', 'income');
create type public.movement_kind as enum ('expense', 'income', 'transfer');
create type public.movement_origin as enum ('manual', 'opening_balance', 'reconciliation', 'statement');
create type public.expense_split as enum ('first', 'second', 'half');
create type public.installment_plan_kind as enum ('purchase', 'advance');

-- ---------------------------------------------------------------------------
-- Perfil: ingreso, días de pago y avance del recorrido inicial
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column monthly_income integer
    check (monthly_income is null or monthly_income between 1 and 2000000000),
  add column pay_days smallint[] not null default '{15,30}',
  add column onboarding_step smallint not null default 0
    check (onboarding_step between 0 and 6),
  -- Quincenal: dos días, en orden. Mensual: un día.
  add constraint profiles_pay_days_valid check (
    cardinality(pay_days) = case pay_frequency when 'biweekly' then 2 else 1 end
    and 1 <= all (pay_days)
    and 31 >= all (pay_days)
    and (cardinality(pay_days) = 1 or pay_days[1] < pay_days[2])
  );

comment on column public.profiles.monthly_income is 'Ingreso promedio mensual, en pesos enteros.';
comment on column public.profiles.pay_days is 'Días habituales de pago: dos si es quincenal, uno si es mensual.';
comment on column public.profiles.onboarding_step is 'Último paso terminado del recorrido inicial (0 a 6).';

grant update (monthly_income, pay_days, onboarding_step) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Bolsillos y categorías
-- ---------------------------------------------------------------------------

create table public.pockets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.pocket_kind not null,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, kind),
  unique (user_id, id)
);

comment on table public.pockets is 'Dónde está la plata: cuenta, efectivo y tarjeta de crédito. El saldo no se guarda: sale de sumar movimientos.';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.category_kind not null,
  name text not null check (char_length(name) between 1 and 40),
  is_system boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  unique (user_id, id)
);

comment on table public.categories is 'Categorías de gasto e ingreso de cada usuario.';

-- ---------------------------------------------------------------------------
-- Movimientos (en esta issue solo se usan para los saldos iniciales)
-- ---------------------------------------------------------------------------

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.movement_kind not null,
  origin public.movement_origin not null default 'manual',
  amount integer not null check (amount > 0),
  occurred_on date not null,
  pocket_id uuid not null,
  to_pocket_id uuid,
  category_id uuid,
  description text check (description is null or char_length(description) between 1 and 140),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, pocket_id) references public.pockets (user_id, id),
  foreign key (user_id, to_pocket_id) references public.pockets (user_id, id),
  foreign key (user_id, category_id) references public.categories (user_id, id),
  -- Solo los traslados tienen destino, y nunca es el mismo bolsillo.
  check ((kind = 'transfer') = (to_pocket_id is not null)),
  check (to_pocket_id is distinct from pocket_id),
  check (kind <> 'transfer' or category_id is null)
);

comment on table public.movements is 'Cada gasto, ingreso o traslado. Los montos son pesos enteros y siempre positivos.';

-- Un solo saldo inicial por bolsillo.
create unique index movements_one_opening_per_pocket
  on public.movements (pocket_id) where origin = 'opening_balance';
create index movements_user_date on public.movements (user_id, occurred_on desc);

-- ---------------------------------------------------------------------------
-- Gastos fijos
-- ---------------------------------------------------------------------------

create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  amount integer not null check (amount > 0),
  due_day smallint not null check (due_day between 1 and 31),
  category_id uuid not null,
  split public.expense_split not null default 'first',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, category_id) references public.categories (user_id, id)
);

comment on column public.fixed_expenses.split is 'De qué quincena sale: primera, segunda, o mitad y mitad.';

-- ---------------------------------------------------------------------------
-- Tarjeta de crédito y cuotas en curso
-- ---------------------------------------------------------------------------

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  -- Una sola tarjeta por usuario en esta versión.
  user_id uuid not null unique default auth.uid() references public.profiles (id) on delete cascade,
  pocket_id uuid not null,
  statement_day smallint not null check (statement_day between 1 and 31),
  payment_day smallint not null check (payment_day between 1 and 31),
  monthly_rate numeric(5, 2) not null default 3.00 check (monthly_rate between 0 and 15),
  rate_is_estimated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, pocket_id) references public.pockets (user_id, id)
);

comment on column public.credit_cards.monthly_rate is 'Tasa de interés mensual, en porcentaje. 3 % si el usuario no la conoce.';
comment on column public.credit_cards.rate_is_estimated is 'Verdadero cuando la tasa es el 3 % por defecto y no la real.';

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  credit_card_id uuid not null,
  movement_id uuid,
  kind public.installment_plan_kind not null,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  principal integer not null check (principal > 0),
  installments_count smallint not null check (installments_count between 1 and 120),
  -- Verdadero si la deuda venía de antes de usar la app (se registró en la configuración inicial).
  is_initial boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, credit_card_id) references public.credit_cards (user_id, id) on delete cascade,
  foreign key (user_id, movement_id) references public.movements (user_id, id)
);

comment on column public.installment_plans.principal is 'Saldo del plan al registrarlo, en pesos enteros.';
comment on column public.installment_plans.installments_count is 'Cuotas del plan (las que faltan, si venía de antes).';

-- ---------------------------------------------------------------------------
-- Deudas y metas
-- ---------------------------------------------------------------------------

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  original_amount integer not null check (original_amount > 0),
  installment_amount integer not null check (installment_amount > 0),
  payment_day smallint not null check (payment_day between 1 and 31),
  installments_remaining smallint not null check (installments_remaining between 1 and 600),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

comment on column public.debts.original_amount is 'Lo que se debía al registrar la deuda, en pesos enteros.';

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  target_amount integer not null check (target_amount > 0),
  target_date date not null,
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Seguridad por fila: igual para todas
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'pockets', 'categories', 'movements', 'fixed_expenses',
    'credit_cards', 'installment_plans', 'debts', 'goals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format(
      'create policy "El dueño lee sus filas" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "El dueño crea sus filas" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "El dueño cambia sus filas" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "El dueño borra sus filas" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- Permisos: solo lo que la app necesita hoy. Las políticas de arriba limitan cada permiso
-- a las filas propias; sin el permiso, la política no alcanza.
grant select, insert on table public.pockets to authenticated;
grant select on table public.categories to authenticated;
grant select, insert, delete on table public.movements to authenticated;
grant update (amount, occurred_on, category_id, description) on table public.movements to authenticated;
grant select, insert, delete on table public.fixed_expenses to authenticated;
grant update (name, amount, due_day, category_id, split, active) on table public.fixed_expenses to authenticated;
grant select, insert on table public.credit_cards to authenticated;
grant update (statement_day, payment_day, monthly_rate, rate_is_estimated) on table public.credit_cards to authenticated;
grant select, insert, delete on table public.installment_plans to authenticated;
grant update (kind, name, principal, installments_count) on table public.installment_plans to authenticated;
grant select, insert, delete on table public.debts to authenticated;
grant update (name, original_amount, installment_amount, payment_day, installments_remaining, closed_at)
  on table public.debts to authenticated;
grant select, insert, delete on table public.goals to authenticated;
grant update (name, target_amount, target_date, achieved_at) on table public.goals to authenticated;

create trigger fixed_expenses_set_updated_at before update on public.fixed_expenses
  for each row execute function public.set_updated_at();
create trigger credit_cards_set_updated_at before update on public.credit_cards
  for each row execute function public.set_updated_at();
create trigger installment_plans_set_updated_at before update on public.installment_plans
  for each row execute function public.set_updated_at();
create trigger debts_set_updated_at before update on public.debts
  for each row execute function public.set_updated_at();
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Datos de arranque de cada usuario
-- ---------------------------------------------------------------------------

-- Crea los bolsillos y las categorías con los que empieza una cuenta.
-- Se puede correr varias veces: no duplica.
create function public.seed_user_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pockets (user_id, kind, name)
  values (p_user_id, 'account', 'Cuenta'), (p_user_id, 'cash', 'Efectivo')
  on conflict (user_id, kind) do nothing;

  insert into public.categories (user_id, kind, name)
  select p_user_id, c.kind, c.name
  from (
    values
      ('expense'::public.category_kind, 'Comida'),
      ('expense', 'Transporte'),
      ('expense', 'Vivienda'),
      ('expense', 'Servicios'),
      ('expense', 'Salud'),
      ('expense', 'Educación'),
      ('expense', 'Entretenimiento'),
      ('expense', 'Deudas'),
      ('expense', 'Ahorro'),
      ('expense', 'Otros'),
      ('income', 'Salario'),
      ('income', 'Otros ingresos')
  ) as c (kind, name)
  on conflict (user_id, kind, name) do nothing;
end;
$$;

revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;

-- Al crearse una cuenta: perfil, bolsillos y categorías.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text := btrim(coalesce(new.raw_user_meta_data ->> 'name', ''));
begin
  if profile_name = '' then
    raise exception 'El nombre es obligatorio para crear la cuenta'
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, name) values (new.id, profile_name);
  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Las cuentas que ya existían reciben lo mismo.
do $$
declare
  p record;
begin
  for p in select id from public.profiles loop
    perform public.seed_user_defaults(p.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operaciones que tocan varias filas a la vez
-- ---------------------------------------------------------------------------

-- Fija el saldo inicial de un bolsillo. Reemplaza el anterior; con 0 no deja movimiento.
-- Corre con los permisos del usuario, así que solo toca sus propias filas.
create function public.set_opening_balance(p_kind public.pocket_kind, p_amount integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pocket uuid;
  v_today date;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'El saldo no puede ser negativo' using errcode = 'check_violation';
  end if;

  select id into v_pocket from public.pockets where user_id = v_user and kind = p_kind;
  if v_pocket is null then
    raise exception 'No existe ese bolsillo' using errcode = 'no_data_found';
  end if;

  select (now() at time zone time_zone)::date into v_today
  from public.profiles where id = v_user;

  delete from public.movements where pocket_id = v_pocket and origin = 'opening_balance';

  if p_amount > 0 then
    insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id)
    values (
      v_user,
      -- En la tarjeta, el saldo inicial es deuda: cuenta como gasto hecho con ella.
      case when p_kind = 'credit_card' then 'expense' else 'income' end::public.movement_kind,
      'opening_balance',
      p_amount,
      v_today,
      v_pocket
    );
  end if;
end;
$$;

-- Guarda la tarjeta: crea su bolsillo si falta, guarda sus datos y fija lo que se debe hoy.
create function public.save_credit_card(
  p_statement_day smallint,
  p_payment_day smallint,
  p_monthly_rate numeric,
  p_rate_is_estimated boolean,
  p_debt integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pocket uuid;
  v_card uuid;
begin
  insert into public.pockets (user_id, kind, name)
  values (v_user, 'credit_card', 'Tarjeta de crédito')
  on conflict (user_id, kind) do nothing;

  select id into v_pocket from public.pockets where user_id = v_user and kind = 'credit_card';

  select id into v_card from public.credit_cards where user_id = v_user;
  if v_card is null then
    insert into public.credit_cards (user_id, pocket_id, statement_day, payment_day, monthly_rate, rate_is_estimated)
    values (v_user, v_pocket, p_statement_day, p_payment_day, p_monthly_rate, p_rate_is_estimated)
    returning id into v_card;
  else
    update public.credit_cards
    set statement_day = p_statement_day,
        payment_day = p_payment_day,
        monthly_rate = p_monthly_rate,
        rate_is_estimated = p_rate_is_estimated
    where id = v_card;
  end if;

  perform public.set_opening_balance('credit_card', p_debt);
  return v_card;
end;
$$;

revoke execute on function public.set_opening_balance(public.pocket_kind, integer) from public, anon;
revoke execute on function public.save_credit_card(smallint, smallint, numeric, boolean, integer) from public, anon;
grant execute on function public.set_opening_balance(public.pocket_kind, integer) to authenticated;
grant execute on function public.save_credit_card(smallint, smallint, numeric, boolean, integer) to authenticated;

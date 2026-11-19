-- Quincenas (issue 6): «Me pagaron» registra el pago y abre la quincena, y cada quincena
-- aparta la plata de los gastos fijos que le tocan. Lo apartado sigue en la cuenta, pero no
-- está libre para gastar.
--
-- Vocabulario:
--   - Pago del calendario: cada pago que se espera, por ejemplo «el del 15 de noviembre».
--     Se guarda como el mes (primer día del mes) y cuál pago del mes es (1 o 2).
--   - Quincena: la plata de un pago, desde el día en que llegó de verdad hasta el siguiente.
--     Con pago mensual hay un solo pago por mes, y todo sale de él.
--   - Apartado: plata de una quincena reservada para un compromiso con fecha.
--
-- La fecha estimada de cada pago (con fines de semana y festivos) la calcula la app; la base
-- de datos guarda el resultado y se encarga de los apartados.

create type public.set_aside_source as enum ('fixed_expense', 'card', 'debt', 'goal');

-- ---------------------------------------------------------------------------
-- Quincenas
-- ---------------------------------------------------------------------------

create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  pay_month date not null check (extract(day from pay_month) = 1),
  pay_slot smallint not null check (pay_slot in (1, 2)),
  started_on date not null,
  amount_received integer not null check (amount_received > 0),
  expected_end_on date not null,
  -- El ingreso que registró «Me pagaron». Si se borra, la quincena se va con él.
  movement_id uuid not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  -- Un pago del calendario abre una sola quincena.
  unique (user_id, pay_month, pay_slot),
  unique (movement_id),
  foreign key (user_id, movement_id) references public.movements (user_id, id) on delete cascade,
  check (expected_end_on > started_on)
);

comment on table public.pay_periods is 'Cada quincena: de un pago real al siguiente. La abre «Me pagaron».';
comment on column public.pay_periods.pay_month is 'Mes del pago del calendario al que corresponde (primer día del mes).';
comment on column public.pay_periods.pay_slot is 'Cuál pago del mes: 1 (el primer día de pago) o 2 (el segundo).';
comment on column public.pay_periods.started_on is 'Día en que llegó el pago de verdad.';
comment on column public.pay_periods.amount_received is 'Lo que llegó de verdad, en pesos enteros. Manda sobre el ingreso promedio.';
comment on column public.pay_periods.expected_end_on is 'Cuándo se espera el pago siguiente, estimado al abrir la quincena.';
comment on column public.pay_periods.closed_at is 'Cuándo se cerró (issue 7).';

create trigger pay_periods_set_updated_at before update on public.pay_periods
  for each row execute function public.set_updated_at();

-- Número que ordena los pagos del calendario: uno mayor es un pago posterior.
-- Es el mismo cálculo que hace la app (instanceKey en src/lib/pay-periods/schedule.ts).
create function public.pay_instance_key(p_month date, p_slot smallint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ((extract(year from p_month)::integer * 12 + extract(month from p_month)::integer - 1) * 2
    + p_slot - 1);
$$;

-- ---------------------------------------------------------------------------
-- Apartados
-- ---------------------------------------------------------------------------

create table public.set_asides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  pay_period_id uuid not null,
  source public.set_aside_source not null,
  fixed_expense_id uuid,
  amount integer not null check (amount > 0),
  -- El vencimiento que cubre (el día del gasto fijo en un mes concreto).
  due_on date not null,
  -- El gasto que registró «Ya pagué». Si se borra ese gasto, el apartado vuelve a pendiente.
  paid_movement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, pay_period_id) references public.pay_periods (user_id, id) on delete cascade,
  foreign key (user_id, fixed_expense_id) references public.fixed_expenses (user_id, id) on delete cascade,
  foreign key (user_id, paid_movement_id) references public.movements (user_id, id)
    on delete set null (paid_movement_id),
  -- Por ahora solo hay apartados de gastos fijos; tarjeta, deudas y meta llegan en las issues 8 y 9.
  check ((source = 'fixed_expense') = (fixed_expense_id is not null))
);

comment on table public.set_asides is 'Plata de una quincena reservada para un compromiso. Sigue en la cuenta, pero no está libre.';
comment on column public.set_asides.amount is 'Lo que esta quincena aparta para ese vencimiento (la mitad, si se reparte mitad y mitad).';

-- Cada quincena aparta a lo sumo una vez cada vencimiento de un gasto fijo.
create unique index set_asides_one_per_due
  on public.set_asides (pay_period_id, fixed_expense_id, due_on) where fixed_expense_id is not null;
create index set_asides_fixed_due on public.set_asides (fixed_expense_id, due_on);
create index set_asides_paid_movement on public.set_asides (paid_movement_id)
  where paid_movement_id is not null;

create trigger set_asides_set_updated_at before update on public.set_asides
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seguridad por fila, igual que las demás tablas
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['pay_periods', 'set_asides'] loop
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

-- Las funciones de abajo corren con los permisos del usuario, así que necesita estos.
grant select, insert, delete on table public.pay_periods to authenticated;
grant update (started_on, amount_received) on table public.pay_periods to authenticated;
grant select, insert, delete on table public.set_asides to authenticated;
grant update (amount, paid_movement_id) on table public.set_asides to authenticated;

-- ---------------------------------------------------------------------------
-- Qué aparta cada quincena
-- ---------------------------------------------------------------------------

-- Lo que la quincena `p_period` debe tener apartado para cada vencimiento de un gasto fijo.
--
-- Reglas:
--   1. Cada gasto fijo sale del primer pago del mes, del segundo, o la mitad de cada uno.
--      Con pago mensual, todo sale del único pago.
--   2. El pago que cubre un vencimiento es el último de los elegidos antes de ese día: con
--      pagos el 15 y el 30, un arriendo del 5 que sale del primero se aparta del pago del 15
--      del mes anterior; uno del 20 que sale del primero, del pago del 15 del mismo mes.
--   3. Una quincena aparta lo que le toca a su pago y, además, lo que les tocaba a pagos
--      anteriores que no lo apartaron (porque el gasto fijo se creó después, porque no se
--      registró ese pago o porque es la primera quincena), siempre que el vencimiento no
--      haya pasado antes de empezar la quincena ni antes de crear el gasto fijo.
--   4. Lo que ya apartaron otras quincenas para el mismo vencimiento se descuenta, y un
--      vencimiento que ya se pagó no se vuelve a apartar.
create function public.fixed_set_aside_targets(p_period uuid)
returns table (fixed_expense_id uuid, due_on date, amount integer, paid boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with period as (
    select
      p.id,
      p.user_id,
      p.pay_month,
      p.started_on,
      public.pay_instance_key(p.pay_month, p.pay_slot) as key,
      -- El pago de la quincena anterior; si no hay, el pago justo antes de este.
      coalesce(
        (
          select max(public.pay_instance_key(o.pay_month, o.pay_slot))
          from public.pay_periods o
          where o.user_id = p.user_id
            and public.pay_instance_key(o.pay_month, o.pay_slot)
              < public.pay_instance_key(p.pay_month, p.pay_slot)
        ),
        public.pay_instance_key(p.pay_month, p.pay_slot) - 1
      ) as previous_key,
      pr.pay_frequency,
      pr.pay_days,
      pr.time_zone
    from public.pay_periods p
    join public.profiles pr on pr.id = p.user_id
    where p.id = p_period
  ),
  -- Qué parte de cada gasto fijo sale de cada pago del mes.
  portions as (
    select
      f.id,
      f.due_day,
      (f.created_at at time zone period.time_zone)::date as created_on,
      s.slot,
      period.pay_days[s.slot] as pay_day,
      s.amount
    from period
    join public.fixed_expenses f on f.user_id = period.user_id and f.active
    cross join lateral (
      values
        (1::smallint, case
          when period.pay_frequency = 'monthly' or f.split = 'first' then f.amount
          when f.split = 'half' then f.amount / 2
          else 0
        end),
        (2::smallint, case
          when period.pay_frequency = 'monthly' then 0
          when f.split = 'second' then f.amount
          when f.split = 'half' then f.amount - f.amount / 2
          else 0
        end)
    ) as s (slot, amount)
    where s.amount > 0
  ),
  -- Los vencimientos del mes anterior, el de la quincena y el siguiente, con el pago que
  -- cubre cada parte.
  occurrences as (
    select
      pt.id,
      pt.amount,
      pt.created_on,
      make_date(
        extract(year from m.month)::integer,
        extract(month from m.month)::integer,
        least(pt.due_day, extract(day from (m.month + interval '1 month - 1 day'))::integer)
      ) as due_on,
      public.pay_instance_key(
        (case when pt.due_day >= pt.pay_day then m.month else m.month - interval '1 month' end)::date,
        pt.slot
      ) as covering
    from portions pt
    cross join period
    cross join lateral (
      select (period.pay_month + make_interval(months => k))::date as month
      from generate_series(-1, 1) as k
    ) as m
  ),
  required as (
    select o.id, o.due_on, sum(o.amount)::integer as amount
    from occurrences o
    cross join period
    where o.covering <= period.key
      and o.due_on >= o.created_on
      and (o.covering > period.previous_key or o.due_on >= period.started_on)
    group by o.id, o.due_on
  )
  select
    r.id,
    r.due_on,
    (r.amount - coalesce((
      select sum(s.amount)
      from public.set_asides s
      where s.fixed_expense_id = r.id and s.due_on = r.due_on and s.pay_period_id <> p_period
    ), 0))::integer,
    exists (
      select 1
      from public.set_asides s
      where s.fixed_expense_id = r.id and s.due_on = r.due_on and s.paid_movement_id is not null
    )
  from required r;
$$;

-- Deja los apartados de la quincena en curso como deben estar. Se puede correr las veces que
-- sea: no duplica, y no toca lo que ya se pagó. Corre al abrir una quincena y cada vez que
-- cambia un gasto fijo o los días de pago.
create function public.sync_set_asides()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_period uuid;
begin
  if v_user is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));

  select id into v_period
  from public.pay_periods
  where user_id = v_user
  order by pay_month desc, pay_slot desc
  limit 1;
  if v_period is null then
    return;
  end if;

  -- Lo pendiente que ya no corresponde (el gasto cambió de día, se borró o ya se pagó).
  delete from public.set_asides s
  where s.pay_period_id = v_period
    and s.source = 'fixed_expense'
    and s.paid_movement_id is null
    and (s.fixed_expense_id, s.due_on) not in (
      select t.fixed_expense_id, t.due_on
      from public.fixed_set_aside_targets(v_period) t
      where t.amount > 0 and not t.paid
    );

  -- Lo que falta, o el valor nuevo si el gasto cambió.
  insert into public.set_asides as s (user_id, pay_period_id, source, fixed_expense_id, due_on, amount)
  select v_user, v_period, 'fixed_expense', t.fixed_expense_id, t.due_on, t.amount
  from public.fixed_set_aside_targets(v_period) t
  where t.amount > 0 and not t.paid
  on conflict (pay_period_id, fixed_expense_id, due_on) where fixed_expense_id is not null
  do update set amount = excluded.amount
  where s.paid_movement_id is null and s.amount <> excluded.amount;
end;
$$;

-- Sin un usuario con sesión no hay nada que recalcular: así, cuando Supabase borra una cuenta
-- (y con ella sus gastos fijos), no intenta apartar nada.
create function public.sync_set_asides_trigger()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    perform public.sync_set_asides();
  end if;
  return null;
end;
$$;

create trigger fixed_expenses_sync_set_asides
  after insert or update or delete on public.fixed_expenses
  for each statement execute function public.sync_set_asides_trigger();

create trigger profiles_sync_set_asides
  after update of pay_frequency, pay_days on public.profiles
  for each statement execute function public.sync_set_asides_trigger();

-- ---------------------------------------------------------------------------
-- «Me pagaron»
-- ---------------------------------------------------------------------------

-- La quincena más reciente del usuario (la que está en curso), con bloqueo para cambiarla.
create function public.latest_pay_period()
returns public.pay_periods
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.pay_periods
  where user_id = (select auth.uid())
  order by pay_month desc, pay_slot desc
  limit 1;
$$;

-- Registra un pago: el ingreso en la cuenta, la quincena nueva y sus apartados.
-- El pago del calendario (mes y número) y la fecha del siguiente los calcula la app; aquí se
-- comprueba que sea un pago posterior al último registrado, para no abrir dos quincenas
-- para el mismo pago.
create function public.open_pay_period(
  p_amount integer,
  p_received_on date,
  p_pay_month date,
  p_pay_slot smallint,
  p_expected_end_on date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_profile public.profiles;
  v_last public.pay_periods;
  v_account uuid;
  v_category uuid;
  v_movement uuid;
  v_period uuid;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));

  select * into v_profile from public.profiles where id = v_user;
  if v_profile.id is null then
    raise exception 'No hay perfil' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'El valor debe ser positivo' using errcode = 'check_violation';
  end if;
  if p_pay_slot is null or p_pay_slot > cardinality(v_profile.pay_days) then
    raise exception 'Ese pago no existe con tus días de pago' using errcode = 'check_violation';
  end if;
  if p_received_on > (now() at time zone v_profile.time_zone)::date then
    raise exception 'La fecha no puede ser después de hoy' using errcode = 'check_violation';
  end if;

  v_last := public.latest_pay_period();
  if v_last.id is not null then
    if public.pay_instance_key(p_pay_month, p_pay_slot)
      <= public.pay_instance_key(v_last.pay_month, v_last.pay_slot) then
      raise exception 'Ese pago ya está registrado' using errcode = 'PA409';
    end if;
    if p_received_on < v_last.started_on then
      raise exception 'La fecha va antes de la quincena anterior' using errcode = 'check_violation';
    end if;
  end if;

  select id into v_account from public.pockets where user_id = v_user and kind = 'account';
  -- El pago entra como «Salario»; si ya no existe con ese nombre, como «Otros ingresos».
  select id into v_category
  from public.categories
  where user_id = v_user and kind = 'income'
  order by (name = 'Salario') desc, (name = 'Otros ingresos') desc, created_at
  limit 1;

  insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, category_id)
  values (v_user, 'income', 'payday', p_amount, p_received_on, v_account, v_category)
  returning id into v_movement;

  insert into public.pay_periods (
    user_id, pay_month, pay_slot, started_on, amount_received, expected_end_on, movement_id
  )
  values (v_user, p_pay_month, p_pay_slot, p_received_on, p_amount, p_expected_end_on, v_movement)
  returning id into v_period;

  perform public.sync_set_asides();
  return v_period;
end;
$$;

-- Corrige el valor o la fecha del último pago. Solo el último: los anteriores ya son historia.
create function public.update_pay_period(p_id uuid, p_amount integer, p_received_on date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_last public.pay_periods;
  v_previous_start date;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));

  v_last := public.latest_pay_period();
  if v_last.id is distinct from p_id then
    raise exception 'Solo se corrige el último pago' using errcode = 'PA409';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'El valor debe ser positivo' using errcode = 'check_violation';
  end if;
  if p_received_on > (select (now() at time zone time_zone)::date from public.profiles where id = v_user) then
    raise exception 'La fecha no puede ser después de hoy' using errcode = 'check_violation';
  end if;

  select max(started_on) into v_previous_start
  from public.pay_periods
  where user_id = v_user and id <> p_id;
  if p_received_on < v_previous_start then
    raise exception 'La fecha va antes de la quincena anterior' using errcode = 'check_violation';
  end if;

  update public.movements
  set amount = p_amount, occurred_on = p_received_on
  where id = v_last.movement_id;
  update public.pay_periods
  set amount_received = p_amount, started_on = p_received_on
  where id = p_id;

  perform public.sync_set_asides();
end;
$$;

-- Borra el último pago y su quincena. Si ya se marcó algo como pagado con esa plata, primero
-- hay que borrar esos pagos: así nada queda pagado con plata que no llegó.
create function public.delete_pay_period(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_last public.pay_periods;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));

  v_last := public.latest_pay_period();
  if v_last.id is distinct from p_id then
    raise exception 'Solo se borra el último pago' using errcode = 'PA409';
  end if;
  if exists (
    select 1 from public.set_asides where pay_period_id = p_id and paid_movement_id is not null
  ) then
    raise exception 'La quincena tiene pagos marcados' using errcode = 'PA423';
  end if;

  -- Al borrar el ingreso se van la quincena y sus apartados.
  delete from public.movements where id = v_last.movement_id;
  -- La quincena anterior vuelve a ser la que está en curso.
  perform public.sync_set_asides();
end;
$$;

-- ---------------------------------------------------------------------------
-- «Ya pagué»
-- ---------------------------------------------------------------------------

-- Marca un apartado como pagado: registra el gasto (desde la cuenta, con la fecha de hoy) y
-- marca todos los apartados de ese vencimiento, para que no se cuente dos veces. Si a la
-- quincena le faltaba apartar una parte (por pagar antes), la completa.
create function public.pay_set_aside(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_row public.set_asides;
  v_fixed public.fixed_expenses;
  v_elsewhere integer;
  v_account uuid;
  v_movement uuid;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));

  select * into v_row from public.set_asides where id = p_id;
  if v_row.id is null then
    raise exception 'No existe ese apartado' using errcode = 'no_data_found';
  end if;
  if v_row.paid_movement_id is not null then
    raise exception 'Ya está pagado' using errcode = 'PA409';
  end if;
  select * into v_fixed from public.fixed_expenses where id = v_row.fixed_expense_id;

  select coalesce(sum(amount), 0) into v_elsewhere
  from public.set_asides
  where fixed_expense_id = v_row.fixed_expense_id and due_on = v_row.due_on and id <> p_id;
  if v_fixed.amount - v_elsewhere > 0 then
    update public.set_asides set amount = v_fixed.amount - v_elsewhere where id = p_id;
  end if;

  select id into v_account from public.pockets where user_id = v_user and kind = 'account';
  insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, category_id, description)
  values (
    v_user,
    'expense',
    'manual',
    v_fixed.amount,
    (select (now() at time zone time_zone)::date from public.profiles where id = v_user),
    v_account,
    v_fixed.category_id,
    v_fixed.name
  )
  returning id into v_movement;

  update public.set_asides
  set paid_movement_id = v_movement
  where fixed_expense_id = v_row.fixed_expense_id and due_on = v_row.due_on;

  return v_movement;
end;
$$;

-- Solo quien tiene sesión puede llamar estas funciones, y cada una toca solo sus filas.
revoke execute on function public.pay_instance_key(date, smallint) from public, anon;
revoke execute on function public.fixed_set_aside_targets(uuid) from public, anon;
revoke execute on function public.sync_set_asides() from public, anon;
revoke execute on function public.sync_set_asides_trigger() from public, anon;
revoke execute on function public.latest_pay_period() from public, anon;
revoke execute on function public.open_pay_period(integer, date, date, smallint, date) from public, anon;
revoke execute on function public.update_pay_period(uuid, integer, date) from public, anon;
revoke execute on function public.delete_pay_period(uuid) from public, anon;
revoke execute on function public.pay_set_aside(uuid) from public, anon;

grant execute on function public.pay_instance_key(date, smallint) to authenticated;
grant execute on function public.fixed_set_aside_targets(uuid) to authenticated;
grant execute on function public.sync_set_asides() to authenticated;
grant execute on function public.sync_set_asides_trigger() to authenticated;
grant execute on function public.latest_pay_period() to authenticated;
grant execute on function public.open_pay_period(integer, date, date, smallint, date) to authenticated;
grant execute on function public.update_pay_period(uuid, integer, date) to authenticated;
grant execute on function public.delete_pay_period(uuid) to authenticated;
grant execute on function public.pay_set_aside(uuid) to authenticated;

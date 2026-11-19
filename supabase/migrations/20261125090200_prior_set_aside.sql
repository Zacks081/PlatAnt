-- El primer pago en la app: ¿lo de antes ya estaba apartado?
--
-- La primera quincena aparta también lo que les tocaba a pagos anteriores, que no están en la
-- app (por ejemplo, la primera mitad de un gasto del 30 cuando el primer pago registrado es el
-- de la segunda quincena). Al registrar ese primer pago se pregunta si esa plata ya estaba
-- apartada con lo que el usuario tenía:
--   - sí: esa parte se marca como «de antes» (prior_amount). Sigue apartada y se paga con
--     «Ya pagué» como siempre, pero no sale de la plata de esta quincena.
--   - no: esta quincena la aparta toda, como antes.

alter table public.pay_periods
  add column prior_covered boolean not null default false;

comment on column public.pay_periods.prior_covered is
  'Solo en la primera quincena: lo que les tocaba a pagos anteriores a la app ya estaba apartado.';

alter table public.set_asides
  add column prior_amount integer not null default 0 check (prior_amount >= 0);

comment on column public.set_asides.prior_amount is
  'Parte del apartado que ya estaba apartada con plata de antes de la app: no sale de esta quincena.';

grant update (prior_amount) on public.set_asides to authenticated;
grant update (prior_covered) on public.pay_periods to authenticated;

-- Lo mismo de antes, y además cuánto de cada vencimiento es «de antes». Ver las reglas en
-- 20261124090100_pay_periods.sql; lo nuevo es la regla 5:
--   5. En la primera quincena, si el usuario dijo que ya lo tenía apartado, lo que les tocaba
--      a pagos anteriores es «de antes». Solo para gastos fijos que ya existían al registrar
--      el pago: uno creado después no pudo estar apartado.
drop function public.fixed_set_aside_targets(uuid);

create function public.fixed_set_aside_targets(p_period uuid)
returns table (fixed_expense_id uuid, due_on date, amount integer, paid boolean, prior_amount integer)
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
      p.prior_covered,
      p.created_at,
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
      f.created_at <= period.created_at as existed,
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
      pt.existed,
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
    select
      o.id,
      o.due_on,
      sum(o.amount)::integer as amount,
      coalesce(sum(o.amount) filter (
        where period.prior_covered and o.existed and o.covering <= period.previous_key
      ), 0)::integer as prior
    from occurrences o
    cross join period
    where o.covering <= period.key
      and o.due_on >= o.created_on
      and (o.covering > period.previous_key or o.due_on >= period.started_on)
    group by o.id, o.due_on
  ),
  targets as (
    select
      r.id,
      r.due_on,
      r.prior,
      (r.amount - coalesce((
        select sum(s.amount)
        from public.set_asides s
        where s.fixed_expense_id = r.id and s.due_on = r.due_on and s.pay_period_id <> p_period
      ), 0))::integer as amount
    from required r
  )
  select
    t.id,
    t.due_on,
    t.amount,
    exists (
      select 1
      from public.set_asides s
      where s.fixed_expense_id = t.id and s.due_on = t.due_on and s.paid_movement_id is not null
    ),
    greatest(0, least(t.prior, t.amount))::integer
  from targets t;
$$;

create or replace function public.sync_set_asides()
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
  insert into public.set_asides as s (
    user_id, pay_period_id, source, fixed_expense_id, due_on, amount, prior_amount
  )
  select v_user, v_period, 'fixed_expense', t.fixed_expense_id, t.due_on, t.amount, t.prior_amount
  from public.fixed_set_aside_targets(v_period) t
  where t.amount > 0 and not t.paid
  on conflict (pay_period_id, fixed_expense_id, due_on) where fixed_expense_id is not null
  do update set amount = excluded.amount, prior_amount = excluded.prior_amount
  where s.paid_movement_id is null
    and (s.amount <> excluded.amount or s.prior_amount <> excluded.prior_amount);
end;
$$;

-- «Me pagaron», ahora con la respuesta a «¿ya lo tenías apartado?». Si es el primer pago, hay
-- algo que les tocaba a pagos anteriores y la app pide preguntar (`p_ask_prior`), no registra
-- nada: devuelve el error PA428 con ese valor en el detalle, para hacer la pregunta.
drop function public.open_pay_period(integer, date, date, smallint, date, public.pocket_kind);

create function public.open_pay_period(
  p_amount integer,
  p_received_on date,
  p_pay_month date,
  p_pay_slot smallint,
  p_expected_end_on date,
  p_pocket_kind public.pocket_kind default 'account',
  p_prior_covered boolean default false,
  p_ask_prior boolean default false
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
  v_pocket uuid;
  v_category uuid;
  v_movement uuid;
  v_period uuid;
  v_prior integer;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));

  select * into v_profile from public.profiles where id = v_user;
  if v_profile.id is null then
    raise exception 'No hay perfil' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'El valor debe ser positivo' using errcode = 'check_violation';
  end if;
  if p_pocket_kind is null or p_pocket_kind not in ('account', 'cash') then
    raise exception 'El pago entra a la cuenta o al efectivo' using errcode = 'check_violation';
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

  select id into v_pocket from public.pockets where user_id = v_user and kind = p_pocket_kind;
  -- El pago entra como «Salario»; si ya no existe con ese nombre, como «Otros ingresos».
  select id into v_category
  from public.categories
  where user_id = v_user and kind = 'income'
  order by (name = 'Salario') desc, (name = 'Otros ingresos') desc, created_at
  limit 1;

  insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, category_id)
  values (v_user, 'income', 'payday', p_amount, p_received_on, v_pocket, v_category)
  returning id into v_movement;

  insert into public.pay_periods (
    user_id, pay_month, pay_slot, started_on, amount_received, expected_end_on, movement_id,
    prior_covered
  )
  values (
    v_user, p_pay_month, p_pay_slot, p_received_on, p_amount, p_expected_end_on, v_movement,
    -- Solo la primera quincena puede tener plata «de antes».
    v_last.id is null and (p_prior_covered or p_ask_prior)
  )
  returning id into v_period;

  perform public.sync_set_asides();

  if p_ask_prior and v_last.id is null then
    select coalesce(sum(prior_amount), 0) into v_prior
    from public.set_asides
    where pay_period_id = v_period;
    if v_prior > 0 then
      -- Deshace todo lo de arriba: la app pregunta y vuelve a llamar con la respuesta.
      raise exception 'Hay plata que les tocaba a pagos anteriores' using
        errcode = 'PA428', detail = v_prior::text;
    end if;
    -- No había nada «de antes»: no se preguntó, así que no queda marcado.
    update public.pay_periods set prior_covered = false where id = v_period;
  end if;

  return v_period;
end;
$$;

revoke execute on function public.fixed_set_aside_targets(uuid) from public, anon;
revoke execute on function public.open_pay_period(integer, date, date, smallint, date, public.pocket_kind, boolean, boolean) from public, anon;
grant execute on function public.fixed_set_aside_targets(uuid) to authenticated;
grant execute on function public.open_pay_period(integer, date, date, smallint, date, public.pocket_kind, boolean, boolean) to authenticated;

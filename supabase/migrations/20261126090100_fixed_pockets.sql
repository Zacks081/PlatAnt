-- Bolsillos de gastos fijos.
--
-- Cada gasto fijo tiene su propio bolsillo, como los bolsillos de los bancos. Al registrar
-- «Me pagaron», la quincena pasa sola de la cuenta a cada bolsillo lo que le toca (y queda en
-- el historial). Desde el bolsillo se aparta más, se saca o se paga el gasto.
--
-- Los apartados de la quincena (set_asides) siguen siendo el plan: cuánto le toca a cada pago
-- y qué vencimiento ya se pagó. La plata, en cambio, está en el bolsillo: su saldo es la suma
-- de sus movimientos, como en la cuenta.

-- ---------------------------------------------------------------------------
-- Bolsillos: además de cuenta, efectivo y tarjeta (uno de cada uno), uno por gasto fijo
-- ---------------------------------------------------------------------------

alter table public.pockets
  add column fixed_expense_id uuid,
  add column archived_at timestamptz,
  add constraint pockets_fixed_expense_fkey
    foreign key (user_id, fixed_expense_id) references public.fixed_expenses (user_id, id)
    on delete set null (fixed_expense_id),
  add constraint pockets_fixed_expense_kind
    check (kind = 'fixed_expense' or fixed_expense_id is null);

comment on column public.pockets.fixed_expense_id is 'El gasto fijo de este bolsillo. Se vacía si el gasto se borra.';
comment on column public.pockets.archived_at is 'Cuándo se archivó (al borrar su gasto fijo). Sus movimientos se conservan.';

alter table public.pockets drop constraint pockets_user_id_kind_key;
create unique index pockets_one_per_kind on public.pockets (user_id, kind) where kind <> 'fixed_expense';
create unique index pockets_one_per_fixed_expense on public.pockets (fixed_expense_id)
  where fixed_expense_id is not null;

grant update (name, archived_at) on table public.pockets to authenticated;

-- Las funciones que crean la cuenta, el efectivo y la tarjeta, iguales que antes pero con el
-- índice nuevo (ya no hay uno solo por tipo para todos los bolsillos).
create or replace function public.seed_user_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pockets (user_id, kind, name)
  values (p_user_id, 'account', 'Cuenta'), (p_user_id, 'cash', 'Efectivo')
  on conflict (user_id, kind) where kind <> 'fixed_expense' do nothing;

  insert into public.categories (user_id, kind, name, icon)
  select p_user_id, c.kind, c.name, c.icon
  from (
    values
      ('expense'::public.category_kind, 'Comida', 'comida'),
      ('expense', 'Transporte', 'transporte'),
      ('expense', 'Vivienda', 'vivienda'),
      ('expense', 'Servicios', 'servicios'),
      ('expense', 'Salud', 'salud'),
      ('expense', 'Educación', 'educacion'),
      ('expense', 'Entretenimiento', 'entretenimiento'),
      ('expense', 'Deudas', 'deudas'),
      ('expense', 'Ahorro', 'ahorro'),
      ('expense', 'Comisiones y cargos', 'comisiones'),
      ('expense', 'Otros', 'otros'),
      ('income', 'Salario', 'salario'),
      ('income', 'Otros ingresos', 'ingresos')
  ) as c (kind, name, icon)
  on conflict (user_id, kind, name) do nothing;

  -- Si el usuario ya tenía una categoría con ese nombre, esa pasa a ser la del sistema.
  update public.categories
  set is_system = true, archived_at = null
  where user_id = p_user_id and kind = 'expense' and name = 'Comisiones y cargos';
end;
$$;

create or replace function public.save_credit_card(
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
  on conflict (user_id, kind) where kind <> 'fixed_expense' do nothing;

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

-- El saldo de un solo bolsillo (la misma cuenta de pocket_balances).
create function public.pocket_balance(p_pocket uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    case
      when m.to_pocket_id = p_pocket then m.amount
      when m.kind = 'income' then m.amount
      else -m.amount
    end
  ), 0)::bigint
  from public.movements m
  where m.pocket_id = p_pocket or m.to_pocket_id = p_pocket;
$$;

-- ---------------------------------------------------------------------------
-- Un bolsillo por gasto fijo
-- ---------------------------------------------------------------------------

create function public.fixed_expense_pocket()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pocket uuid;
  v_account uuid;
  v_balance bigint;
begin
  if tg_op = 'INSERT' then
    insert into public.pockets (user_id, kind, name, fixed_expense_id)
    values (new.user_id, 'fixed_expense', left(new.name, 40), new.id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      update public.pockets set name = left(new.name, 40) where fixed_expense_id = new.id;
    end if;
    return new;
  end if;

  -- Al borrar el gasto fijo, lo que quede en su bolsillo vuelve a la cuenta y el bolsillo se
  -- archiva: sus movimientos siguen en el historial. Sin sesión (Supabase borrando la cuenta
  -- entera) no hay nada que devolver.
  if (select auth.uid()) is null then
    return old;
  end if;
  select id into v_pocket from public.pockets where fixed_expense_id = old.id;
  if v_pocket is not null then
    v_balance := public.pocket_balance(v_pocket);
    if v_balance > 0 then
      select id into v_account from public.pockets where user_id = old.user_id and kind = 'account';
      insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, to_pocket_id, description)
      values (
        old.user_id, 'transfer', 'manual', v_balance,
        (select (now() at time zone time_zone)::date from public.profiles where id = old.user_id),
        v_pocket, v_account, 'Devuelto al borrar el gasto fijo'
      );
    end if;
    update public.pockets set archived_at = now() where id = v_pocket;
  end if;
  return old;
end;
$$;

create trigger fixed_expenses_pocket_insert
  after insert on public.fixed_expenses
  for each row execute function public.fixed_expense_pocket();
create trigger fixed_expenses_pocket_rename
  after update of name on public.fixed_expenses
  for each row execute function public.fixed_expense_pocket();
create trigger fixed_expenses_pocket_delete
  before delete on public.fixed_expenses
  for each row execute function public.fixed_expense_pocket();

-- Los gastos fijos que ya existían reciben su bolsillo.
insert into public.pockets (user_id, kind, name, fixed_expense_id)
select f.user_id, 'fixed_expense', left(f.name, 40), f.id
from public.fixed_expenses f
where not exists (select 1 from public.pockets p where p.fixed_expense_id = f.id);

-- ---------------------------------------------------------------------------
-- Lo que aparta sola cada quincena
-- ---------------------------------------------------------------------------

-- Los movimientos que hizo una quincena por su cuenta (lo que pasó a los bolsillos y lo que
-- ya estaba apartado de antes) quedan unidos a ella: si se borra el pago, se van con él.
alter table public.movements
  add column pay_period_id uuid,
  add constraint movements_pay_period_fkey
    foreign key (user_id, pay_period_id) references public.pay_periods (user_id, id) on delete cascade;

comment on column public.movements.pay_period_id is 'La quincena que hizo este movimiento sola al abrirse.';

-- Cada quincena pasa plata a cada bolsillo una sola vez.
create unique index movements_one_set_aside_per_period
  on public.movements (pay_period_id, to_pocket_id) where origin = 'set_aside';

-- Pasa a los bolsillos de los gastos fijos lo que le toca a la quincena `p_period`:
--   - Si es la primera quincena y el usuario dijo que ya tenía apartado lo de antes, eso entra
--     primero como saldo inicial del bolsillo.
--   - Luego, de la cuenta a cada bolsillo, lo que la quincena aparta para ese gasto, pero nunca
--     más de lo que falta para completar sus vencimientos sin pagar: si sobró plata de un pago
--     anterior, aparta menos.
--   - Lo hace una sola vez por bolsillo y quincena. Si después cambia el gasto fijo, la plata
--     no se mueve sola: se aparta o se saca a mano desde el bolsillo.
create function public.fund_fixed_pockets(p_period uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_period public.pay_periods;
  v_account uuid;
  r record;
  v_cap bigint;
  v_amount bigint;
begin
  select * into v_period from public.pay_periods where id = p_period;
  if v_period.id is null then
    return;
  end if;
  -- El dueño de la quincena (con sesión, siempre es el usuario mismo).
  v_user := v_period.user_id;
  select id into v_account from public.pockets where user_id = v_user and kind = 'account';

  if v_period.prior_covered then
    insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, pay_period_id)
    select v_user, 'income', 'opening_balance', s.prior, v_period.started_on, p.id, p_period
    from (
      select fixed_expense_id, sum(prior_amount)::integer as prior
      from public.set_asides
      where pay_period_id = p_period
      group by fixed_expense_id
      having sum(prior_amount) > 0
    ) s
    join public.pockets p on p.fixed_expense_id = s.fixed_expense_id
    where not exists (
      select 1 from public.movements m where m.pocket_id = p.id and m.origin = 'opening_balance'
    );
  end if;

  for r in
    select s.fixed_expense_id, sum(s.amount)::bigint as portion, p.id as pocket_id, f.amount as fixed_amount
    from public.set_asides s
    join public.pockets p on p.fixed_expense_id = s.fixed_expense_id
    join public.fixed_expenses f on f.id = s.fixed_expense_id
    where s.pay_period_id = p_period
      and s.paid_movement_id is null
      and not exists (
        select 1 from public.movements m
        where m.pay_period_id = p_period and m.origin = 'set_aside' and m.to_pocket_id = p.id
      )
    group by s.fixed_expense_id, p.id, f.amount
  loop
    select count(distinct due_on) * r.fixed_amount into v_cap
    from public.set_asides
    where fixed_expense_id = r.fixed_expense_id and paid_movement_id is null;
    v_amount := least(r.portion, v_cap - public.pocket_balance(r.pocket_id));
    if v_amount > 0 then
      insert into public.movements (
        user_id, kind, origin, amount, occurred_on, pocket_id, to_pocket_id, pay_period_id
      )
      values (
        v_user, 'transfer', 'set_aside', v_amount, v_period.started_on, v_account, r.pocket_id, p_period
      );
    end if;
  end loop;
end;
$$;

-- Lo mismo de antes y, al final, pasa la plata a los bolsillos.
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

  perform public.fund_fixed_pockets(v_period);
end;
$$;

-- Las quincenas en curso que ya existían llenan sus bolsillos de una vez.
do $$
declare
  p record;
begin
  for p in
    select distinct on (user_id) id
    from public.pay_periods
    order by user_id, pay_month desc, pay_slot desc
  loop
    perform public.fund_fixed_pockets(p.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apartar, sacar y pagar desde un bolsillo
-- ---------------------------------------------------------------------------

-- Apartar (de la cuenta al bolsillo) o sacar (del bolsillo a la cuenta). No se saca más de lo
-- que tiene el bolsillo.
create function public.move_fixed_pocket(
  p_fixed_expense uuid,
  p_amount integer,
  p_occurred_on date,
  p_into_pocket boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pocket uuid;
  v_account uuid;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));
  if p_amount is null or p_amount < 1 then
    raise exception 'El valor debe ser positivo' using errcode = 'check_violation';
  end if;
  if p_occurred_on > (select (now() at time zone time_zone)::date from public.profiles where id = v_user) then
    raise exception 'La fecha no puede ser después de hoy' using errcode = 'check_violation';
  end if;
  select id into v_pocket from public.pockets
  where fixed_expense_id = p_fixed_expense and archived_at is null;
  if v_pocket is null then
    raise exception 'No existe ese bolsillo' using errcode = 'no_data_found';
  end if;
  if not p_into_pocket and p_amount > public.pocket_balance(v_pocket) then
    raise exception 'El bolsillo no tiene tanto' using errcode = 'PA402';
  end if;
  select id into v_account from public.pockets where user_id = v_user and kind = 'account';

  insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, to_pocket_id)
  values (
    v_user, 'transfer', 'manual', p_amount, p_occurred_on,
    case when p_into_pocket then v_account else v_pocket end,
    case when p_into_pocket then v_pocket else v_account end
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Pagar un gasto fijo desde su bolsillo: registra el gasto «Pago <nombre>» y marca como pagado
-- el vencimiento pendiente más cercano. Si el bolsillo no alcanza, avisa (PA402, con lo que
-- falta en el detalle); con `p_cover_from_account`, pasa lo que falta desde la cuenta antes de
-- pagar. Lo que sobre se queda en el bolsillo.
create function public.pay_fixed_expense(
  p_fixed_expense uuid,
  p_amount integer,
  p_occurred_on date,
  p_cover_from_account boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_fixed public.fixed_expenses;
  v_pocket uuid;
  v_account uuid;
  v_balance bigint;
  v_movement uuid;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));
  if p_amount is null or p_amount < 1 then
    raise exception 'El valor debe ser positivo' using errcode = 'check_violation';
  end if;
  if p_occurred_on > (select (now() at time zone time_zone)::date from public.profiles where id = v_user) then
    raise exception 'La fecha no puede ser después de hoy' using errcode = 'check_violation';
  end if;
  select * into v_fixed from public.fixed_expenses where id = p_fixed_expense;
  select id into v_pocket from public.pockets where fixed_expense_id = p_fixed_expense;
  if v_fixed.id is null or v_pocket is null then
    raise exception 'No existe ese gasto fijo' using errcode = 'no_data_found';
  end if;

  v_balance := public.pocket_balance(v_pocket);
  if p_amount > v_balance then
    if not coalesce(p_cover_from_account, false) then
      raise exception 'El bolsillo no alcanza' using
        errcode = 'PA402', detail = (p_amount - v_balance)::text;
    end if;
    select id into v_account from public.pockets where user_id = v_user and kind = 'account';
    insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, to_pocket_id, description)
    values (v_user, 'transfer', 'manual', p_amount - v_balance, p_occurred_on, v_account, v_pocket, 'Para completar el pago');
  end if;

  insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, category_id, description)
  values (v_user, 'expense', 'manual', p_amount, p_occurred_on, v_pocket, v_fixed.category_id, left('Pago ' || v_fixed.name, 140))
  returning id into v_movement;

  update public.set_asides
  set paid_movement_id = v_movement
  where fixed_expense_id = p_fixed_expense
    and due_on = (
      select min(due_on) from public.set_asides
      where fixed_expense_id = p_fixed_expense and paid_movement_id is null
    );

  return v_movement;
end;
$$;

-- «Ya pagué» queda reemplazado por «Pagar» desde el bolsillo.
drop function public.pay_set_aside(uuid);

revoke execute on function public.pocket_balance(uuid) from public, anon;
revoke execute on function public.fixed_expense_pocket() from public, anon;
revoke execute on function public.fund_fixed_pockets(uuid) from public, anon;
revoke execute on function public.move_fixed_pocket(uuid, integer, date, boolean) from public, anon;
revoke execute on function public.pay_fixed_expense(uuid, integer, date, boolean) from public, anon;
grant execute on function public.pocket_balance(uuid) to authenticated;
grant execute on function public.fixed_expense_pocket() to authenticated;
grant execute on function public.fund_fixed_pockets(uuid) to authenticated;
grant execute on function public.move_fixed_pocket(uuid, integer, date, boolean) to authenticated;
grant execute on function public.pay_fixed_expense(uuid, integer, date, boolean) to authenticated;

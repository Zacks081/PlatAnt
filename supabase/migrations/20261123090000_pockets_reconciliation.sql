-- Bolsillos y cuadre (issue 5): el costo de un retiro, retiros y consignaciones en un solo
-- paso, y el cuadre de saldo.

-- ---------------------------------------------------------------------------
-- Categoría «Comisiones y cargos»
-- ---------------------------------------------------------------------------

-- Ahí va el costo de un retiro (y, en la issue 8, los intereses y cargos de la tarjeta).
-- Es del sistema: la app la busca por esa marca, así que no se puede renombrar ni ocultar.
create or replace function public.seed_user_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pockets (user_id, kind, name)
  values (p_user_id, 'account', 'Cuenta'), (p_user_id, 'cash', 'Efectivo')
  on conflict (user_id, kind) do nothing;

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

revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;

-- Las cuentas que ya existían reciben la categoría nueva.
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
-- Costo de un retiro
-- ---------------------------------------------------------------------------

-- El costo se guarda como un gasto aparte, unido a su retiro: si se borra el retiro, su costo
-- se va con él.
alter table public.movements
  add column parent_id uuid,
  add constraint movements_parent_fkey
    foreign key (user_id, parent_id) references public.movements (user_id, id) on delete cascade,
  add constraint movements_parent_is_expense check (parent_id is null or kind = 'expense');

comment on column public.movements.parent_id is 'El retiro del que salió este gasto (su costo).';

create unique index movements_one_child_per_parent
  on public.movements (parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- Retiro y consignación
-- ---------------------------------------------------------------------------

-- Guarda un retiro (de la cuenta al efectivo) o una consignación (del efectivo a la cuenta)
-- junto con el costo del retiro, todo de una vez. Con `p_id` edita uno que ya existe; su
-- sentido no cambia. Un costo de 0 o nulo quita el que hubiera.
-- Corre con los permisos del usuario, así que solo toca sus propias filas.
create function public.save_transfer(
  p_from public.pocket_kind,
  p_amount integer,
  p_occurred_on date,
  p_id uuid default null,
  p_description text default null,
  p_fee integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_from uuid;
  v_to uuid;
  v_id uuid;
  v_fee_category uuid;
begin
  if p_from not in ('account', 'cash') then
    raise exception 'Solo se traslada entre la cuenta y el efectivo' using errcode = 'check_violation';
  end if;
  if p_fee is not null and p_fee < 0 then
    raise exception 'El costo no puede ser negativo' using errcode = 'check_violation';
  end if;
  if coalesce(p_fee, 0) > 0 and p_from <> 'account' then
    raise exception 'Solo un retiro tiene costo' using errcode = 'check_violation';
  end if;

  select id into v_from from public.pockets where user_id = v_user and kind = p_from;
  select id into v_to from public.pockets
  where user_id = v_user and kind = case p_from when 'account' then 'cash' else 'account' end::public.pocket_kind;
  if v_from is null or v_to is null then
    raise exception 'No existe ese bolsillo' using errcode = 'no_data_found';
  end if;

  if p_id is null then
    insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, to_pocket_id, description)
    values (v_user, 'transfer', 'manual', p_amount, p_occurred_on, v_from, v_to, p_description)
    returning id into v_id;
  else
    update public.movements
    set amount = p_amount, occurred_on = p_occurred_on, description = p_description
    where id = p_id and user_id = v_user and kind = 'transfer' and origin = 'manual' and pocket_id = v_from
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese traslado no existe' using errcode = 'no_data_found';
    end if;
  end if;

  if coalesce(p_fee, 0) = 0 then
    delete from public.movements where parent_id = v_id;
  elsif exists (select 1 from public.movements where parent_id = v_id) then
    -- El costo sigue la fecha del retiro; lo demás (por ejemplo, su nota) se respeta.
    update public.movements set amount = p_fee, occurred_on = p_occurred_on where parent_id = v_id;
  else
    select id into v_fee_category from public.categories
    where user_id = v_user and kind = 'expense' and is_system and name = 'Comisiones y cargos';
    insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id, category_id, description, parent_id)
    values (v_user, 'expense', 'manual', p_fee, p_occurred_on, v_from, v_fee_category, 'Costo del retiro', v_id);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_transfer(public.pocket_kind, integer, date, uuid, text, integer) from public, anon;
grant execute on function public.save_transfer(public.pocket_kind, integer, date, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Cuadre de saldo
-- ---------------------------------------------------------------------------

-- El usuario dice cuánto tiene de verdad en la cuenta o en el efectivo, y la diferencia con
-- lo que calcula la app se registra hoy como «gasto sin registrar» (si hay menos) o «ingreso
-- sin registrar» (si hay más). Si no hay diferencia, no se registra nada.
-- `p_expected` es el saldo que vio el usuario al cuadrar: si cambió mientras tanto, no se
-- cuadra, para no registrar una diferencia que no vio.
-- Devuelve la diferencia: lo que tiene de verdad menos lo que calculaba la app.
create function public.reconcile_pocket(
  p_kind public.pocket_kind,
  p_expected bigint,
  p_actual integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pocket uuid;
  v_balance bigint;
  v_difference bigint;
  v_today date;
begin
  if p_kind not in ('account', 'cash') then
    raise exception 'Solo se cuadran la cuenta y el efectivo' using errcode = 'check_violation';
  end if;
  if p_actual is null or p_actual < 0 then
    raise exception 'El saldo real no puede ser negativo' using errcode = 'check_violation';
  end if;

  select id into v_pocket from public.pockets where user_id = v_user and kind = p_kind;
  if v_pocket is null then
    raise exception 'No existe ese bolsillo' using errcode = 'no_data_found';
  end if;

  -- Dos cuadres a la vez del mismo bolsillo se hacen uno detrás del otro.
  perform pg_advisory_xact_lock(hashtext('reconcile:' || v_pocket::text));

  select balance into v_balance from public.pocket_balances() where pocket_id = v_pocket;
  if v_balance is distinct from p_expected then
    raise exception 'El saldo cambió mientras cuadrabas' using errcode = 'PA409';
  end if;

  v_difference := p_actual - v_balance;
  if v_difference = 0 then
    return 0;
  end if;

  select (now() at time zone time_zone)::date into v_today
  from public.profiles where id = v_user;

  insert into public.movements (user_id, kind, origin, amount, occurred_on, pocket_id)
  values (
    v_user,
    case when v_difference < 0 then 'expense' else 'income' end::public.movement_kind,
    'reconciliation',
    abs(v_difference),
    v_today,
    v_pocket
  );
  return v_difference;
end;
$$;

revoke execute on function public.reconcile_pocket(public.pocket_kind, bigint, integer) from public, anon;
grant execute on function public.reconcile_pocket(public.pocket_kind, bigint, integer) to authenticated;

-- El pago de la quincena puede llegar a la cuenta o en efectivo. «Me pagaron» y su corrección
-- reciben el bolsillo; si no se dice, sigue siendo la cuenta.

drop function public.open_pay_period(integer, date, date, smallint, date);
drop function public.update_pay_period(uuid, integer, date);

-- Registra un pago: el ingreso en el bolsillo elegido, la quincena nueva y sus apartados.
-- El pago del calendario (mes y número) y la fecha del siguiente los calcula la app; aquí se
-- comprueba que sea un pago posterior al último registrado, para no abrir dos quincenas
-- para el mismo pago.
create function public.open_pay_period(
  p_amount integer,
  p_received_on date,
  p_pay_month date,
  p_pay_slot smallint,
  p_expected_end_on date,
  p_pocket_kind public.pocket_kind default 'account'
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
    user_id, pay_month, pay_slot, started_on, amount_received, expected_end_on, movement_id
  )
  values (v_user, p_pay_month, p_pay_slot, p_received_on, p_amount, p_expected_end_on, v_movement)
  returning id into v_period;

  perform public.sync_set_asides();
  return v_period;
end;
$$;

-- Corrige el valor, la fecha o el bolsillo del último pago. Solo el último: los anteriores ya
-- son historia. Sin bolsillo, se queda donde estaba.
create function public.update_pay_period(
  p_id uuid,
  p_amount integer,
  p_received_on date,
  p_pocket_kind public.pocket_kind default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_last public.pay_periods;
  v_previous_start date;
  v_pocket uuid;
begin
  perform pg_advisory_xact_lock(hashtext('pay:' || v_user::text));

  v_last := public.latest_pay_period();
  if v_last.id is distinct from p_id then
    raise exception 'Solo se corrige el último pago' using errcode = 'PA409';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'El valor debe ser positivo' using errcode = 'check_violation';
  end if;
  if p_pocket_kind is not null and p_pocket_kind not in ('account', 'cash') then
    raise exception 'El pago entra a la cuenta o al efectivo' using errcode = 'check_violation';
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

  if p_pocket_kind is not null then
    select id into v_pocket from public.pockets where user_id = v_user and kind = p_pocket_kind;
  end if;

  update public.movements
  set amount = p_amount, occurred_on = p_received_on, pocket_id = coalesce(v_pocket, pocket_id)
  where id = v_last.movement_id;
  update public.pay_periods
  set amount_received = p_amount, started_on = p_received_on
  where id = p_id;

  perform public.sync_set_asides();
end;
$$;

revoke execute on function public.open_pay_period(integer, date, date, smallint, date, public.pocket_kind) from public, anon;
revoke execute on function public.update_pay_period(uuid, integer, date, public.pocket_kind) from public, anon;
grant execute on function public.open_pay_period(integer, date, date, smallint, date, public.pocket_kind) to authenticated;
grant execute on function public.update_pay_period(uuid, integer, date, public.pocket_kind) to authenticated;

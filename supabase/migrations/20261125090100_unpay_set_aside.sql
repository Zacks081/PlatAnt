-- Al borrar el gasto de un «Ya pagué», el apartado vuelve a quedar como estaba.
--
-- «Ya pagué» completa el apartado hasta el valor del gasto fijo (por ejemplo, la primera mitad
-- de 60.000 sube a 120.000 si se paga todo de una). Esa diferencia se guarda aparte, para
-- devolverla si el pago se borra; y luego se recalculan los apartados de la quincena en curso.

alter table public.set_asides
  add column paid_adjustment integer not null default 0;

comment on column public.set_asides.paid_adjustment is
  'Cuánto cambió el valor al marcarlo pagado; se resta si el pago se borra.';

grant update (paid_adjustment) on public.set_asides to authenticated;

create or replace function public.pay_set_aside(p_id uuid)
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
  if v_fixed.amount - v_elsewhere > 0 and v_fixed.amount - v_elsewhere <> v_row.amount then
    update public.set_asides
    set amount = v_fixed.amount - v_elsewhere,
        paid_adjustment = v_fixed.amount - v_elsewhere - v_row.amount
    where id = p_id;
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

-- Cuando el pago se borra (el vínculo queda vacío), el apartado vuelve a su valor de antes.
create function public.restore_unpaid_set_aside()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.amount := new.amount - new.paid_adjustment;
  new.paid_adjustment := 0;
  return new;
end;
$$;

create trigger set_asides_restore_on_unpay
  before update of paid_movement_id on public.set_asides
  for each row
  when (old.paid_movement_id is not null and new.paid_movement_id is null)
  execute function public.restore_unpaid_set_aside();

-- Y la quincena en curso vuelve a apartar lo que ese pago había dejado sin apartar.
create trigger set_asides_sync_on_unpay
  after update of paid_movement_id on public.set_asides
  for each row
  when (old.paid_movement_id is not null and new.paid_movement_id is null)
  execute function public.sync_set_asides_trigger();

revoke execute on function public.restore_unpaid_set_aside() from public, anon;
grant execute on function public.restore_unpaid_set_aside() to authenticated;

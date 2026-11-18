-- Movimientos (issue 4): registrar gastos e ingresos, el historial y las categorías propias.

-- ---------------------------------------------------------------------------
-- Categorías: ícono y marca de «gasto hormiga»
-- ---------------------------------------------------------------------------

alter table public.categories
  add column icon text not null default 'otros' check (icon ~ '^[a-z-]{1,30}$'),
  add column is_ant boolean not null default false;

comment on column public.categories.icon is 'Clave del ícono que se muestra con la categoría.';
comment on column public.categories.is_ant is 'Si sus gastos cuentan como «gasto hormiga» (issue 12).';

-- Íconos de las categorías de arranque.
update public.categories set icon = case name
    when 'Comida' then 'comida'
    when 'Transporte' then 'transporte'
    when 'Vivienda' then 'vivienda'
    when 'Servicios' then 'servicios'
    when 'Salud' then 'salud'
    when 'Educación' then 'educacion'
    when 'Entretenimiento' then 'entretenimiento'
    when 'Deudas' then 'deudas'
    when 'Ahorro' then 'ahorro'
    when 'Salario' then 'salario'
    when 'Otros ingresos' then 'ingresos'
    else 'otros'
  end;

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
      ('expense', 'Otros', 'otros'),
      ('income', 'Salario', 'salario'),
      ('income', 'Otros ingresos', 'ingresos')
  ) as c (kind, name, icon)
  on conflict (user_id, kind, name) do nothing;
end;
$$;

revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;

-- Crear, renombrar, cambiar ícono, marcar como hormiga y ocultar. Nunca borrar:
-- los movimientos viejos conservan su categoría aunque esté oculta.
grant insert (name, kind, icon, is_ant) on table public.categories to authenticated;
grant update (name, icon, is_ant, archived_at) on table public.categories to authenticated;

-- ---------------------------------------------------------------------------
-- Movimientos
-- ---------------------------------------------------------------------------

-- Un gasto o un ingreso registrado a mano siempre lleva categoría.
alter table public.movements
  add constraint movements_manual_has_category
  check (origin <> 'manual' or kind = 'transfer' or category_id is not null);

-- El bolsillo de un movimiento se puede corregir al editarlo.
grant update (pocket_id) on table public.movements to authenticated;

-- La categoría debe ser del mismo tipo que el movimiento: un gasto con categoría de gasto.
create function public.check_movement_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.category_kind;
begin
  if new.category_id is null then
    return new;
  end if;
  select kind into v_kind from public.categories where id = new.category_id;
  if v_kind::text <> new.kind::text then
    raise exception 'La categoría no corresponde al tipo de movimiento'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger movements_check_category
  before insert or update of category_id, kind on public.movements
  for each row execute function public.check_movement_category();

create index movements_user_category on public.movements (user_id, category_id);

-- ---------------------------------------------------------------------------
-- Saldo de cada bolsillo
-- ---------------------------------------------------------------------------

-- El saldo no se guarda: es la suma de los movimientos. Los ingresos suman, los gastos y
-- los traslados de salida restan, y los traslados de entrada suman. En la tarjeta el
-- resultado es negativo: es lo que se debe.
-- Corre con los permisos del usuario, así que solo ve sus bolsillos y movimientos.
create function public.pocket_balances()
returns table (pocket_id uuid, kind public.pocket_kind, name text, balance bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.kind,
    p.name,
    coalesce(sum(
      case
        when m.to_pocket_id = p.id then m.amount
        when m.kind = 'income' then m.amount
        else -m.amount
      end
    ), 0)::bigint
  from public.pockets p
  left join public.movements m on m.pocket_id = p.id or m.to_pocket_id = p.id
  group by p.id, p.kind, p.name
  order by p.kind;
$$;

revoke execute on function public.pocket_balances() from public, anon;
grant execute on function public.pocket_balances() to authenticated;

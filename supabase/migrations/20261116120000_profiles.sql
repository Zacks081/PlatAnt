-- Perfil de cada usuario: nombre, moneda, zona horaria y frecuencia de pago.
--
-- Patrón de seguridad que siguen todas las tablas de la app:
--   1. Cada fila tiene dueño (aquí, el propio id del usuario; en las demás tablas, user_id).
--   2. La seguridad por fila (RLS) está activa desde que la tabla nace.
--   3. Solo el usuario con sesión ("authenticated") tiene permisos, y solo sobre sus filas.
--      Quien entra sin sesión ("anon") no tiene ningún permiso.

create type public.pay_frequency as enum ('biweekly', 'monthly');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  currency text not null default 'COP' check (currency ~ '^[A-Z]{3}$'),
  time_zone text not null default 'America/Bogota' check (char_length(time_zone) between 1 and 64),
  pay_frequency public.pay_frequency not null default 'biweekly',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de cada usuario. Una fila por usuario, creada sola al registrarse.';
comment on column public.profiles.onboarding_completed is 'Si ya terminó la configuración inicial (issue 3).';

alter table public.profiles enable row level security;

-- Sin sesión, nada. Con sesión: leer y cambiar solo el perfil propio.
-- No hay permiso para crear ni borrar: el perfil nace con la cuenta y se va con ella.
revoke all on table public.profiles from anon, authenticated;
grant select, update (name, currency, time_zone, pay_frequency, onboarding_completed)
  on table public.profiles to authenticated;

create policy "Cada usuario ve solo su perfil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Cada usuario cambia solo su perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- La zona horaria debe existir de verdad (por ejemplo, 'America/Bogota').
create function public.check_profile_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Zona horaria desconocida: %', new.time_zone
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_check_time_zone
  before insert or update of time_zone on public.profiles
  for each row execute function public.check_profile_time_zone();

-- Marca la fecha de cada cambio.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Al crearse una cuenta, nace su perfil con el nombre que llegó en el registro.
-- "security definer" deja que esta función escriba en profiles aunque el usuario no tenga
-- permiso de insertar; por eso fija search_path y no confía en nada más que el nombre.
create function public.handle_new_user()
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
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

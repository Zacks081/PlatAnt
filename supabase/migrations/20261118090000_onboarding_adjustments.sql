-- Ajustes a la configuración inicial después de la primera prueba de Santiago:
--   - «Plan mensual» en la tarjeta: un cobro que se repite cada mes y no se acaba.
--   - Deudas de pago único (con fecha) además de las de mensualidad.
--   - Cada usuario puede crear sus propias categorías.

-- Un plan mensual guarda su valor en `principal` y siempre tiene 1 en `installments_count`.
alter type public.installment_plan_kind add value if not exists 'subscription';

create type public.debt_payment_type as enum ('single', 'monthly');

alter table public.debts
  add column payment_type public.debt_payment_type not null default 'monthly',
  add column due_date date,
  -- Un pago único siempre tiene fecha.
  add constraint debts_single_has_due_date check (payment_type <> 'single' or due_date is not null);

comment on column public.debts.payment_type is 'Pago único (se paga completa en due_date) o mensualidad (cuotas).';
comment on column public.debts.due_date is 'Fecha del pago, solo para las deudas de pago único.';

grant update (payment_type, due_date) on table public.debts to authenticated;

-- Crear categorías: solo el nombre y el tipo. No pueden marcarse como «del sistema»
-- ni crearse a nombre de otro usuario (el dueño lo pone la base de datos).
grant insert (name, kind) on table public.categories to authenticated;

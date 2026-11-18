-- De qué quincena sale el aporte a cada meta: primera, segunda, o mitad y mitad.
alter table public.goals
  add column split public.expense_split not null default 'half';

comment on column public.goals.split is 'De qué quincena se aparta el aporte mensual a la meta.';

grant update (split) on table public.goals to authenticated;

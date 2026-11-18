-- De qué quincena sale el pago de la tarjeta y la cuota de cada deuda, igual que con los
-- gastos fijos: primera, segunda, o mitad y mitad. Por defecto, mitad y mitad.

alter table public.credit_cards
  add column split public.expense_split not null default 'half';

alter table public.debts
  add column split public.expense_split not null default 'half';

comment on column public.credit_cards.split is 'De qué quincena se aparta el pago de la tarjeta.';
comment on column public.debts.split is 'De qué quincena se aparta la cuota de la deuda.';

grant update (split) on table public.credit_cards to authenticated;
grant update (split) on table public.debts to authenticated;

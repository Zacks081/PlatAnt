-- Una compra con tarjeta registrada como gasto crea su plan de cuotas (issue 4).
-- Si se borra el gasto, su plan se va con él.
alter table public.installment_plans
  drop constraint installment_plans_user_id_movement_id_fkey,
  add constraint installment_plans_user_id_movement_id_fkey
    foreign key (user_id, movement_id) references public.movements (user_id, id) on delete cascade;

-- Un gasto tiene a lo sumo un plan de cuotas.
create unique index installment_plans_one_per_movement
  on public.installment_plans (movement_id) where movement_id is not null;

-- Bolsillos de gastos fijos: un tipo de bolsillo nuevo y el origen de lo que aparta sola cada
-- quincena. Van en su propio archivo porque un valor nuevo no se puede usar en la misma
-- transacción que lo crea.
alter type public.pocket_kind add value if not exists 'fixed_expense';
alter type public.movement_origin add value if not exists 'set_aside';

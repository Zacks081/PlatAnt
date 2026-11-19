-- Origen nuevo de movimiento: el ingreso que registra «Me pagaron» (issue 6).
-- Va en su propio archivo porque un valor nuevo de un enum no se puede usar en la misma
-- transacción en que se crea.
alter type public.movement_origin add value if not exists 'payday';

-- =============================================================================
-- 006 — updated_at lo pone el servidor
-- =============================================================================
-- updated_at es el cursor de sincronizacion, asi que TIENE que ser reloj de
-- servidor. Si lo pusiera el cliente, un telefono con la hora mal configurada
-- (cosa comun) escribiria un cursor en el pasado o en el futuro y romperia el
-- pull incremental para todos los dispositivos del hogar.
--
-- Idempotente: "create or replace function" y "drop trigger if exists".
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists medications_touch on public.medications;

create trigger medications_touch
  before insert or update on public.medications
  for each row execute function public.touch_updated_at();

drop trigger if exists dose_events_touch on public.dose_events;

create trigger dose_events_touch
  before insert or update on public.dose_events
  for each row execute function public.touch_updated_at();

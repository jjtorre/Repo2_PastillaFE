-- =============================================================================
-- 008 — Funciones RPC
-- =============================================================================
-- Idempotente: todas son "create or replace function".
-- =============================================================================

-- Crea el hogar Y anade al creador como miembro, en una transaccion.
-- SECURITY DEFINER porque salta el RLS: es la unica forma de resolver el
-- huevo y la gallina descrito en el script 007.
create or replace function public.create_household(
  p_name     text,
  p_timezone text default 'America/Tegucigalpa',
  p_role     text default 'patient'
)
returns public.households
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_household public.households;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  insert into public.households (name, timezone)
  values (p_name, p_timezone)
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, auth.uid(), p_role);

  return v_household;
end;
$fn$;

-- El cuidador canjea el codigo desde la web y queda unido al hogar.
--
-- ES IDEMPOTENTE: canjear dos veces el mismo codigo desde la misma cuenta
-- devuelve el hogar sin error. Recargar la pagina o reintentar tras un fallo
-- de red no debe parecerle al cuidador que su codigo es invalido.
--
-- Los tres motivos de fallo se distinguen a proposito. Un unico mensaje
-- "invalida o expirada" obligaria al cuidador a adivinar si se equivoco al
-- teclear, si el codigo ya lo uso otra persona o si caduco.
create or replace function public.redeem_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_invite public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  -- FOR UPDATE bloquea la fila: dos canjes simultaneos del mismo codigo no
  -- pueden colarse a la vez.
  --
  -- La busqueda NO filtra por redeemed_at ni expires_at: hay que recuperar la
  -- fila para poder decidir si este usuario ya es miembro (caso idempotente)
  -- antes de rechazarla por usada o caducada.
  select * into v_invite
  from public.household_invites
  where code = p_code
  for update;

  if v_invite.code is null then
    raise exception 'invitacion invalida';
  end if;

  -- Camino idempotente: ya perteneces a este hogar, no hay nada que hacer.
  -- Va ANTES de las validaciones porque un codigo que tu mismo canjeaste
  -- figura como usado, y rechazarlo seria absurdo.
  if exists (
    select 1 from public.household_members
    where household_id = v_invite.household_id and user_id = auth.uid()
  ) then
    return v_invite.household_id;
  end if;

  if v_invite.redeemed_at is not null then
    raise exception 'invitacion ya utilizada';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'invitacion expirada';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, auth.uid(), v_invite.role)
  on conflict (household_id, user_id) do nothing;

  update public.household_invites
     set redeemed_at = now(), redeemed_by = auth.uid()
   where code = p_code;

  return v_invite.household_id;
end;
$fn$;

-- "Que dia es hoy" SEGUN EL HOGAR, no segun UTC ni segun el reloj del cliente.
--
-- Esta funcion existe por un bug real detectado en pruebas: con UTC-6, toda
-- dosis tomada entre las 6pm y medianoche se guardaba con la fecha del dia
-- SIGUIENTE, y la vista del cuidador la reportaba como atrasada cuando el
-- paciente acababa de tomarsela. En una app de medicacion eso es medio
-- calendario mal: justo las dosis de la cena.
create or replace function public.household_today(p_medication_id uuid)
returns date
language sql
stable
set search_path = public
as $fn$
  select (now() at time zone h.timezone)::date
  from public.medications m
  join public.households h on h.id = m.household_id
  where m.id = p_medication_id;
$fn$;

-- Registra la toma Y descuenta inventario en UNA transaccion.
--
-- Es IDEMPOTENTE: si la dosis ya estaba registrada devuelve la fila existente
-- y NO vuelve a descontar. Sin esto, un reintento por senal intermitente
-- restaria dos pastillas del inventario por una sola toma.
--
-- p_scheduled_for se deja NULL en el uso normal: el servidor la deriva de la
-- zona horaria del hogar. Solo se pasa explicitamente al subir tomas que se
-- registraron sin conexion en un dia anterior, unico caso en que el cliente
-- sabe algo que el servidor no puede deducir.
create or replace function public.record_dose(
  p_medication_id uuid,
  p_scheduled_for date default null,
  p_event_id      uuid default null,
  p_device_id     text default null
)
returns public.dose_events
language plpgsql
set search_path = public
as $fn$
declare
  v_event public.dose_events;
  v_day   date := coalesce(p_scheduled_for, public.household_today(p_medication_id));
begin
  if v_day is null then
    raise exception 'medicamento % inexistente o sin acceso', p_medication_id;
  end if;

  insert into public.dose_events (id, medication_id, scheduled_for, taken_at, created_by, device_id)
  values (coalesce(p_event_id, gen_random_uuid()), p_medication_id, v_day, now(), auth.uid(), p_device_id)
  on conflict (medication_id, scheduled_for) where undone_at is null
  do nothing
  returning * into v_event;

  -- DO NOTHING no devuelve fila: la dosis ya estaba registrada. Se devuelve
  -- la existente sin tocar el inventario.
  if v_event.id is null then
    select * into v_event
    from public.dose_events
    where medication_id = p_medication_id
      and scheduled_for = v_day
      and undone_at is null;
    return v_event;
  end if;

  update public.medications
     set quantity = greatest(0, quantity - 1)
   where id = p_medication_id;

  return v_event;
end;
$fn$;

-- Desmarca la dosis del dia y devuelve la pastilla al inventario.
create or replace function public.undo_dose(
  p_medication_id uuid,
  p_scheduled_for date default null
)
returns void
language plpgsql
set search_path = public
as $fn$
declare
  v_id  uuid;
  v_day date := coalesce(p_scheduled_for, public.household_today(p_medication_id));
begin
  update public.dose_events
     set undone_at = now()
   where medication_id = p_medication_id
     and scheduled_for = v_day
     and undone_at is null
  returning id into v_id;

  if v_id is not null then
    update public.medications
       set quantity = quantity + 1
     where id = p_medication_id;
  end if;
end;
$fn$;

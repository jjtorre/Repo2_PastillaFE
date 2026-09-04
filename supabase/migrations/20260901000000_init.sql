-- =============================================================================
-- Pastilla — esquema inicial en Supabase
--
-- Disenado para una app OFFLINE-FIRST: el telefono sigue siendo la fuente de
-- verdad inmediata (AsyncStorage), y esto es el espejo remoto al que sincroniza
-- cuando hay internet. De ahi tres decisiones que atraviesan todo el archivo:
--
--   1. Los UUID se generan EN EL DISPOSITIVO, no aqui. Una fila creada sin
--      conexion conserva su identidad al subir. Por eso no hay DEFAULT en los
--      `id` de las tablas que el cliente crea.
--   2. Nada se borra de verdad. `deleted_at` deja una lapida para que el otro
--      dispositivo se entere del borrado en su siguiente pull.
--   3. `updated_at` lo pone SIEMPRE el servidor (trigger). Es el cursor de
--      sincronizacion, asi que debe ser reloj de servidor: los relojes de los
--      telefonos mienten. Conflictos = ultimo en llegar gana.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. IDENTIDAD
-- =============================================================================

-- Supabase ya trae auth.users. No se duplica: se cuelga un perfil de ella.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- El hogar es la unidad de propiedad de los datos. Sustituye a la decision
-- actual de "un telefono compartido por la familia": ahora la familia puede
-- tener varios dispositivos, pero los datos siguen siendo de la familia.
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- La hora de una dosis es hora de PARED, no un instante. Sin esto, "08:00"
  -- se moveria solo al cambiar de zona horaria.
  timezone   text not null default 'America/Tegucigalpa',
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('patient', 'caregiver')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

-- Codigo de un solo uso para que el cuidador se una al hogar desde la web.
create table public.household_invites (
  code         text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  role         text not null default 'caregiver' check (role in ('patient', 'caregiver')),
  created_by   uuid references public.profiles(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  redeemed_at  timestamptz,
  redeemed_by  uuid references public.profiles(id)
);

-- =============================================================================
-- 2. DOMINIO
-- =============================================================================

-- Definicion del medicamento + inventario. NO guarda `status` ni `lastTakenAt`:
-- ambos son estado derivado. Persistirlos crearia una segunda fuente de verdad
-- que se desincroniza entre dispositivos.
create table public.medications (
  id              uuid primary key,                    -- generado en el cliente
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  scheduled_time  time not null,                       -- '08:00' hora local del hogar
  expiration_date date not null,                       -- solo el dia: evita off-by-one
  quantity        integer not null default 0 check (quantity >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Indice del pull incremental: "dame lo que cambio desde mi cursor".
create index medications_sync_idx on public.medications (household_id, updated_at);

-- Log de solo-anexar. Reemplaza al `lastTakenAt` de un solo valor, que
-- destruia el historial en cada toma. Aqui cada dosis marcada es una fila.
create table public.dose_events (
  id            uuid primary key,                      -- generado en el cliente
  medication_id uuid not null references public.medications(id) on delete cascade,
  scheduled_for date not null,                         -- la dosis de QUE dia
  taken_at      timestamptz not null default now(),
  undone_at     timestamptz,                           -- el toggle permite desmarcar
  created_by    uuid references public.profiles(id),
  device_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Pieza clave: una sola toma vigente por dosis programada. Hace el sync
-- IDEMPOTENTE — un telefono con mala senal que reintenta el push no descuenta
-- inventario dos veces. Es parcial, asi que desmarcar y volver a marcar
-- funciona (la fila vieja queda con undone_at y ya no cuenta).
create unique index dose_events_one_per_dose
  on public.dose_events (medication_id, scheduled_for)
  where undone_at is null;

create index dose_events_sync_idx on public.dose_events (updated_at);
create index dose_events_med_idx  on public.dose_events (medication_id, scheduled_for);

-- =============================================================================
-- 3. updated_at LO PONE EL SERVIDOR
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

create trigger medications_touch
  before insert or update on public.medications
  for each row execute function public.touch_updated_at();

create trigger dose_events_touch
  before insert or update on public.dose_events
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- 4. RLS
-- =============================================================================

-- SECURITY DEFINER a proposito: sin esto, una policy sobre household_members
-- que consulte household_members entra en recursion infinita. Al ejecutarse
-- como owner, la funcion salta el RLS de esa tabla y corta el ciclo.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$fn$;

alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.medications       enable row level security;
alter table public.dose_events       enable row level security;

-- profiles: el propio, y el de quienes comparten hogar contigo.
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.household_members me
      join public.household_members other on other.household_id = me.household_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- households / members: solo los tuyos. La creacion va por RPC (ver seccion 5),
-- porque insertar directamente choca con el problema del huevo y la gallina:
-- no puedes anadirte como miembro de un hogar del que aun no eres miembro.
create policy households_select on public.households for select
  using (public.is_household_member(id));

create policy households_update on public.households for update
  using (public.is_household_member(id));

create policy members_select on public.household_members for select
  using (public.is_household_member(household_id));

create policy invites_select on public.household_invites for select
  using (public.is_household_member(household_id));

create policy invites_insert on public.household_invites for insert
  with check (public.is_household_member(household_id));

-- medications: acceso completo para cualquier miembro del hogar.
create policy medications_select on public.medications for select
  using (public.is_household_member(household_id));

create policy medications_insert on public.medications for insert
  with check (public.is_household_member(household_id));

create policy medications_update on public.medications for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- dose_events: se llega al hogar a traves del medicamento.
-- Si quieres que el cuidador sea SOLO LECTURA, cambia el `using` de las
-- policies de escritura por:
--   exists (select 1 from medications m
--           join household_members hm on hm.household_id = m.household_id
--           where m.id = dose_events.medication_id
--             and hm.user_id = auth.uid() and hm.role = 'patient')
create policy dose_events_select on public.dose_events for select
  using (exists (
    select 1 from public.medications m
    where m.id = dose_events.medication_id
      and public.is_household_member(m.household_id)
  ));

create policy dose_events_insert on public.dose_events for insert
  with check (exists (
    select 1 from public.medications m
    where m.id = dose_events.medication_id
      and public.is_household_member(m.household_id)
  ));

create policy dose_events_update on public.dose_events for update
  using (exists (
    select 1 from public.medications m
    where m.id = dose_events.medication_id
      and public.is_household_member(m.household_id)
  ));

-- =============================================================================
-- 5. RPC
-- =============================================================================

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

  select * into v_invite
  from public.household_invites
  where code = p_code and redeemed_at is null and expires_at > now()
  for update;

  if v_invite.code is null then
    raise exception 'invitacion invalida o expirada';
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
-- Sin esto, con UTC-6 toda dosis tomada entre las 6pm y medianoche se guardaria
-- con la fecha del dia SIGUIENTE, y la vista del cuidador la reportaria como
-- atrasada cuando en realidad acababa de tomarse.
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

-- Registra la toma Y descuenta inventario en UNA transaccion. Reemplaza la
-- doble escritura que hoy hace toggleTaken() en el cliente. Es idempotente:
-- si la dosis ya estaba registrada devuelve la fila existente y NO vuelve a
-- descontar — que es justo lo que romperia un reintento de red.
--
-- p_scheduled_for se deja NULL en el uso normal: el servidor la deriva de la
-- zona horaria del hogar. Solo se pasa explicitamente al subir tomas que se
-- registraron sin conexion en un dia anterior.
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

-- =============================================================================
-- 6. VISTAS PARA LA WEB DEL CUIDADOR
-- =============================================================================

-- Equivalente en SQL de computeStatus(): deriva el estado en vez de leerlo.
-- security_invoker = on es obligatorio; si no, la vista se ejecutaria con los
-- permisos del owner y filtraria datos de otros hogares saltandose el RLS.
create view public.v_medication_today
with (security_invoker = on)
as
select
  m.id,
  m.household_id,
  m.name,
  m.scheduled_time,
  m.expiration_date,
  m.quantity,
  (now() at time zone h.timezone)::date as local_date,
  de.taken_at,
  case
    when de.id is not null then 'taken'
    when (now() at time zone h.timezone)::time > m.scheduled_time then 'late'
    else 'pending'
  end as status
from public.medications m
join public.households h on h.id = m.household_id
left join public.dose_events de
       on de.medication_id = m.id
      and de.scheduled_for = (now() at time zone h.timezone)::date
      and de.undone_at is null
where m.deleted_at is null;

-- Adherencia de los ultimos 30 dias — el dato que el cuidador realmente quiere
-- y que el modelo actual de lastTakenAt no puede responder.
create view public.v_adherence_30d
with (security_invoker = on)
as
select
  m.id as medication_id,
  m.household_id,
  m.name,
  count(de.id) filter (where de.undone_at is null) as doses_taken,
  30 as doses_expected,
  round(100.0 * count(de.id) filter (where de.undone_at is null) / 30, 1) as adherence_pct
from public.medications m
left join public.dose_events de
       on de.medication_id = m.id
      and de.scheduled_for > current_date - interval '30 days'
where m.deleted_at is null
group by m.id, m.household_id, m.name;

-- =============================================================================
-- 7. REALTIME — la web del cuidador se actualiza sola
-- =============================================================================

alter publication supabase_realtime add table public.medications;
alter publication supabase_realtime add table public.dose_events;

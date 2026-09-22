-- =============================================================================
-- 003 — Hogares, miembros e invitaciones
-- =============================================================================
-- El hogar es la unidad de propiedad de los datos. Sustituye a la decision
-- original de "un telefono compartido por la familia": ahora la familia puede
-- tener varios dispositivos, pero los datos siguen siendo de la familia.
--
-- Idempotente: "create table if not exists" y "create index if not exists".
-- =============================================================================

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- La hora de una dosis es hora de PARED ("las 8 de la manana"), no un
  -- instante absoluto. Sin esta columna, "08:00" se moveria solo al cambiar
  -- de zona horaria. La usa household_today() en el script 008.
  timezone   text not null default 'America/Tegucigalpa',
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('patient', 'caregiver')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- La clave primaria ya indexa (household_id, user_id). Este indice cubre la
-- consulta inversa: "a que hogares pertenece este usuario".
create index if not exists household_members_user_idx
  on public.household_members (user_id);

-- ---------------------------------------------------------------------------
-- Anadidos posteriores a la creacion original de la tabla.
--
-- "create table if not exists" no toca una tabla que ya existe, asi que en una
-- base ya desplegada estas dos sentencias son las que aplican el cambio. Van
-- aparte para que el script siga siendo re-ejecutable.
-- ---------------------------------------------------------------------------

-- Deshabilitar a alguien NO borra su fila: se conserva quien fue y cuando
-- entro. Es el mismo criterio que con las invitaciones canjeadas — el rastro
-- de quien tuvo acceso a datos medicos no debe poder borrarse.
alter table public.household_members
  add column if not exists disabled_at timestamptz;

-- El rol 'admin' se suma a los dos originales. Administradores del hogar son
-- 'patient' y 'admin': el paciente porque los datos son suyos, y 'admin' para
-- quien monta y gestiona el hogar sin ser quien toma las pastillas.
--
-- Postgres nombra el check en linea como <tabla>_<columna>_check, asi que se
-- elimina por ese nombre antes de recrearlo.
alter table public.household_members
  drop constraint if exists household_members_role_check;
alter table public.household_members
  add constraint household_members_role_check
  check (role in ('patient', 'caregiver', 'admin'));

-- Codigo de un solo uso para que el cuidador se una al hogar desde la web.
create table if not exists public.household_invites (
  code         text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  role         text not null default 'caregiver' check (role in ('patient', 'caregiver')),
  created_by   uuid references public.profiles(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  redeemed_at  timestamptz,
  redeemed_by  uuid references public.profiles(id)
);

-- Mismo motivo que en household_members: el rol 'admin' es posterior, asi que
-- el check hay que rehacerlo para las bases que ya existen.
alter table public.household_invites
  drop constraint if exists household_invites_role_check;
alter table public.household_invites
  add constraint household_invites_role_check
  check (role in ('patient', 'caregiver', 'admin'));

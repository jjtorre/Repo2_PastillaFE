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

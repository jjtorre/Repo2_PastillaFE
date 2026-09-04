-- =============================================================================
-- 007 — Row Level Security
-- =============================================================================
-- Sin esto, la clave anon que viaja dentro de la app daria acceso a los datos
-- de TODAS las familias. El RLS es lo unico que separa un hogar de otro.
--
-- Idempotente: "alter table ... enable row level security" ya lo es de por si,
-- y cada policy se elimina con "drop policy if exists" antes de recrearse.
-- =============================================================================

-- SECURITY DEFINER a proposito, no por descuido.
--
-- Una policy sobre household_members que consulte household_members entraria
-- en recursion infinita. Al ejecutarse como owner, esta funcion salta el RLS
-- de esa tabla y corta el ciclo. Es el error numero uno al montar RLS
-- multi-tenant en Supabase.
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

-- ---------- profiles ----------
-- El propio, y el de quienes comparten hogar contigo.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.household_members me
      join public.household_members other on other.household_id = me.household_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- households y miembros ----------
-- No hay policy de INSERT: crear un hogar va por el RPC create_household()
-- del script 008. Insertar directamente choca con el problema del huevo y la
-- gallina: no puedes anadirte como miembro de un hogar del que aun no eres
-- miembro, porque la policy exige que ya lo seas.
drop policy if exists households_select on public.households;
create policy households_select on public.households for select
  using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households for update
  using (public.is_household_member(id));

drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select
  using (public.is_household_member(household_id));

-- ---------- invitaciones ----------
drop policy if exists invites_select on public.household_invites;
create policy invites_select on public.household_invites for select
  using (public.is_household_member(household_id));

drop policy if exists invites_insert on public.household_invites;
create policy invites_insert on public.household_invites for insert
  with check (public.is_household_member(household_id));

-- ---------- medications ----------
-- Tampoco hay policy de DELETE, y es intencional: borrar es un UPDATE de
-- deleted_at (ver script 004).
drop policy if exists medications_select on public.medications;
create policy medications_select on public.medications for select
  using (public.is_household_member(household_id));

drop policy if exists medications_insert on public.medications;
create policy medications_insert on public.medications for insert
  with check (public.is_household_member(household_id));

drop policy if exists medications_update on public.medications;
create policy medications_update on public.medications for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------- dose_events ----------
-- Se llega al hogar a traves del medicamento.
--
-- Para que el cuidador sea SOLO LECTURA, sustituye el exists de las dos
-- policies de escritura por:
--
--   exists (select 1 from public.medications m
--           join public.household_members hm on hm.household_id = m.household_id
--           where m.id = dose_events.medication_id
--             and hm.user_id = auth.uid() and hm.role = 'patient')
drop policy if exists dose_events_select on public.dose_events;
create policy dose_events_select on public.dose_events for select
  using (exists (
    select 1 from public.medications m
    where m.id = dose_events.medication_id
      and public.is_household_member(m.household_id)
  ));

drop policy if exists dose_events_insert on public.dose_events;
create policy dose_events_insert on public.dose_events for insert
  with check (exists (
    select 1 from public.medications m
    where m.id = dose_events.medication_id
      and public.is_household_member(m.household_id)
  ));

drop policy if exists dose_events_update on public.dose_events;
create policy dose_events_update on public.dose_events for update
  using (exists (
    select 1 from public.medications m
    where m.id = dose_events.medication_id
      and public.is_household_member(m.household_id)
  ));

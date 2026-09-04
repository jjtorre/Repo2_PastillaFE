-- =============================================================================
-- 002 — Perfiles de usuario
-- =============================================================================
-- Supabase ya trae auth.users. No se duplica: se le cuelga un perfil publico,
-- porque auth.users no es consultable desde el cliente.
--
-- Idempotente: "create table if not exists", "create or replace function" y
-- "drop trigger if exists" antes de crear el trigger.
-- =============================================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER: corre como owner para poder escribir en public.profiles
-- desde un trigger sobre auth.users, que es de otro esquema.
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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- tests/00 — Objetos que en Supabase ya existen
-- =============================================================================
-- Los scripts 001-011 dan por hecho auth.users, auth.uid() y el rol
-- 'authenticated', que Supabase aporta. Para poder probarlos en un PostgreSQL
-- limpio (CI o Docker en tu maquina) hay que fabricarlos.
--
-- ESTE ARCHIVO NO SE EJECUTA NUNCA EN SUPABASE. Solo en entornos de prueba.
-- =============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb
);

-- auth.uid() real lee el JWT de la peticion. Aqui lee una variable de sesion,
-- para poder simular a distintos usuarios con "set app.uid = '...'".
create or replace function auth.uid() returns uuid
language sql stable as
$fn$ select nullif(current_setting('app.uid', true), '')::uuid $fn$;

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$do$;

grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;

-- Las pruebas DEBEN correr como 'authenticated', nunca como postgres: el
-- superusuario se salta el RLS, asi que probar con el daria falsos verdes en
-- todos los tests de aislamiento.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- =============================================================================
-- seed/crear_hogar_admin.sql — Arranque del primer hogar
-- =============================================================================
-- Crea un hogar y te deja dentro como ADMINISTRADOR, sin depender de la app
-- movil.
--
-- Hace falta por el problema del huevo y la gallina: el hogar lo crea
-- normalmente la app en su primera sincronizacion, y la web solo sabe UNIRSE
-- a uno existente mediante un codigo. Si no hay ningun hogar, nadie puede
-- generar ese codigo y no hay forma de entrar.
--
-- Corre como el rol `postgres` desde el SQL Editor de Supabase, asi que se
-- salta el RLS. Es la unica via legitima para el primer arranque.
--
-- NO forma parte de la migracion: vive en seed/ para que la integracion
-- continua no lo ejecute (sus globs solo miran Migration/0*.sql y
-- Migration/tests/0[2-9]_*.sql).
--
-- REQUISITO: haber ejecutado antes 003_households.sql, 007_rls.sql y
-- 008_functions.sql. El script lo comprueba y avisa si faltan.
--
-- Idempotente: si ya perteneces a un hogar no crea otro, solo se asegura de
-- que tu rol sea administrador.
-- =============================================================================

do $seed$
declare
  -- <<< CAMBIA ESTO por el correo con el que te registraste en la web
  v_email  text := 'TU-CORREO@ejemplo.com';
  -- <<< y esto por como quieras llamar al hogar
  v_nombre text := 'Casa de la abuela';
  v_zona   text := 'America/Tegucigalpa';

  v_user uuid;
  v_home uuid;
begin
  -- Precondicion: sin el rol 'admin' en el check, el insert de abajo fallaria
  -- con un error de restriccion que no explica nada.
  if not exists (
    select 1 from pg_constraint
     where conname = 'household_members_role_check'
       and pg_get_constraintdef(oid) like '%admin%'
  ) then
    raise exception
      'El esquema esta desactualizado. Ejecuta primero 003_households.sql, 007_rls.sql y 008_functions.sql.';
  end if;

  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    raise exception
      'No existe ningun usuario con el correo %. Registrate primero en la web y vuelve a ejecutar esto.', v_email;
  end if;

  -- El trigger de auth.users ya deberia haberlo creado; por si acaso.
  insert into public.profiles (id, email)
  values (v_user, v_email)
  on conflict (id) do nothing;

  -- Si ya perteneces a algun hogar, se reutiliza en vez de crear otro: dos
  -- hogares para la misma persona es justo la confusion que queremos evitar.
  select household_id into v_home
    from public.household_members
   where user_id = v_user
   limit 1;

  if v_home is null then
    insert into public.households (name, timezone)
    values (v_nombre, v_zona)
    returning id into v_home;

    insert into public.household_members (household_id, user_id, role)
    values (v_home, v_user, 'admin');

    raise notice 'Hogar creado: % (%). Ya eres administrador.', v_nombre, v_home;
  else
    -- Ascenso a administrador, tambien re-ejecutable.
    update public.household_members
       set role = 'admin', disabled_at = null
     where household_id = v_home and user_id = v_user;

    raise notice 'Ya pertenecias al hogar %. Tu rol ahora es administrador.', v_home;
  end if;

  raise notice 'Entra en /panel con tu correo y contrasena.';
end
$seed$;

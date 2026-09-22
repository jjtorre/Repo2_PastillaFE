-- =============================================================================
-- tests/05 — Deshabilitar y reactivar miembros
-- =============================================================================
-- Lo que se protege aqui: que retirar el acceso a alguien sea de verdad, en
-- toda la base, y no solo un boton que esconde cosas en una pantalla.
--
-- Depende de tests/03, que deja al cuidador 22222222 como miembro del hogar.
-- =============================================================================

-- Estado de partida: el cuidador activo.
--
-- Hace falta porque un run anterior que abortara a mitad lo dejaria
-- deshabilitado, y entonces T2 fallaria por el estado heredado y no por un
-- defecto real. Corre como postgres, antes de cambiar de rol, asi que se
-- salta el RLS.
reset role;
update public.household_members
   set disabled_at = null
 where household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and user_id = '22222222-2222-2222-2222-222222222222';

\echo '--- T1: un cuidador NO puede deshabilitar a nadie'
set app.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

do $do$
begin
  perform public.set_member_disabled(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    true
  );
  raise exception 'T1 FALLO: un cuidador pudo deshabilitar al paciente';
exception when others then
  if sqlerrm not like '%administrador%' then
    raise exception 'T1 FALLO: mensaje inesperado -> %', sqlerrm;
  end if;
  raise notice 'T1 OK -> %', sqlerrm;
end
$do$;

\echo '--- T2: el cuidador ve los datos del hogar ANTES de ser deshabilitado'
do $do$
declare v_meds int;
begin
  select count(*) into v_meds from public.medications;
  if v_meds < 1 then raise exception 'T2 FALLO: deberia ver medicamentos'; end if;
  raise notice 'T2 OK -> ve % medicamento(s)', v_meds;
end
$do$;

\echo '--- T3: el administrador lo deshabilita'
reset role;
set app.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $do$
declare v_fecha timestamptz;
begin
  perform public.set_member_disabled(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    true
  );

  select disabled_at into v_fecha from public.household_members
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';

  if v_fecha is null then raise exception 'T3 FALLO: no se marco disabled_at'; end if;
  raise notice 'T3 OK';
end
$do$;

\echo '--- T4: el cuidador deshabilitado NO ve absolutamente nada'
reset role;
set app.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

do $do$
declare v_meds int; v_hogares int; v_eventos int; v_vista int; v_miembros int;
begin
  select count(*) into v_meds     from public.medications;
  select count(*) into v_hogares  from public.households;
  select count(*) into v_eventos  from public.dose_events;
  select count(*) into v_vista    from public.v_medication_today;
  select count(*) into v_miembros from public.household_members;

  if v_meds <> 0 or v_hogares <> 0 or v_eventos <> 0 or v_vista <> 0 or v_miembros <> 0 then
    raise exception 'T4 FALLO - FUGA: meds=% hogares=% eventos=% vista=% miembros=%',
      v_meds, v_hogares, v_eventos, v_vista, v_miembros;
  end if;
  raise notice 'T4 OK -> acceso revocado en toda la base';
end
$do$;

\echo '--- T5: tampoco puede escribir'
do $do$
begin
  insert into public.medications
    (id, household_id, name, scheduled_time, expiration_date, quantity)
  values ('dddddddd-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001',
          'Intento', '09:00', '2030-01-01', 5);
  raise exception 'T5 FALLO: un miembro deshabilitado pudo insertar';
exception when insufficient_privilege or check_violation then
  raise notice 'T5 OK -> bloqueado por RLS';
end
$do$;

\echo '--- T6: IDEMPOTENCIA - deshabilitar de nuevo conserva la fecha original'
reset role;
set app.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $do$
declare v_antes timestamptz; v_despues timestamptz;
begin
  select disabled_at into v_antes from public.household_members
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';

  perform pg_sleep(0.05);
  perform public.set_member_disabled(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    true
  );

  select disabled_at into v_despues from public.household_members
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';

  if v_antes is distinct from v_despues then
    raise exception 'T6 FALLO: la fecha cambio de % a %, falsea cuando se retiro el acceso',
      v_antes, v_despues;
  end if;
  raise notice 'T6 OK';
end
$do$;

\echo '--- T7: un administrador no puede deshabilitarse a si mismo'
do $do$
begin
  perform public.set_member_disabled(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    true
  );
  raise exception 'T7 FALLO: se dejo fuera de su propio hogar';
exception when others then
  if sqlerrm not like '%tu propio acceso%' then
    raise exception 'T7 FALLO: mensaje inesperado -> %', sqlerrm;
  end if;
  raise notice 'T7 OK -> %', sqlerrm;
end
$do$;

\echo '--- T8: no se puede tocar a quien no pertenece al hogar'
do $do$
begin
  perform public.set_member_disabled(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    true
  );
  raise exception 'T8 FALLO: acepto a un usuario ajeno';
exception when others then
  if sqlerrm not like '%no pertenece%' then
    raise exception 'T8 FALLO: mensaje inesperado -> %', sqlerrm;
  end if;
  raise notice 'T8 OK -> %', sqlerrm;
end
$do$;

\echo '--- T9: reactivar devuelve el acceso'
do $do$
begin
  perform public.set_member_disabled(
    'aaaaaaaa-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    false
  );
end
$do$;

reset role;
set app.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

do $do$
declare v_meds int;
begin
  select count(*) into v_meds from public.medications;
  if v_meds < 1 then
    raise exception 'T9 FALLO: sigue sin ver nada tras reactivarlo';
  end if;
  raise notice 'T9 OK -> ve % medicamento(s) de nuevo', v_meds;
end
$do$;

reset role;

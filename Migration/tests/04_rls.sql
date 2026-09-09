-- =============================================================================
-- tests/04 — Aislamiento entre hogares
-- =============================================================================
-- La clave anon viaja dentro de la app y del bundle de la web, asi que
-- cualquiera puede extraerla. Lo unico que impide que un usuario lea los
-- medicamentos de otra familia es el RLS. Si estas pruebas se ponen en verde
-- por error, la fuga seria total y silenciosa.
--
-- Se ejecutan como 'authenticated'. Como postgres pasarian siempre, porque el
-- superusuario se salta el RLS.
-- =============================================================================

-- El extrano (33333333) nunca canjeo un codigo valido: no pertenece a ningun
-- hogar.
set app.uid = '33333333-3333-3333-3333-333333333333';
set role authenticated;

\echo '--- T1: un extrano no ve NADA'
do $do$
declare v_meds int; v_hogares int; v_eventos int; v_vista int;
begin
  select count(*) into v_meds    from public.medications;
  select count(*) into v_hogares from public.households;
  select count(*) into v_eventos from public.dose_events;
  select count(*) into v_vista   from public.v_medication_today;

  if v_meds <> 0 or v_hogares <> 0 or v_eventos <> 0 or v_vista <> 0 then
    raise exception 'T1 FALLO - FUGA DE DATOS: meds=% hogares=% eventos=% vista=%',
      v_meds, v_hogares, v_eventos, v_vista;
  end if;
  raise notice 'T1 OK';
end
$do$;

\echo '--- T2: un extrano no puede insertar en un hogar ajeno'
do $do$
begin
  insert into public.medications
    (id, household_id, name, scheduled_time, expiration_date, quantity)
  values
    ('cccccccc-0000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000001',
     'Intruso', '09:00', '2030-01-01', 10);
  raise exception 'T2 FALLO: el insert deberia haber sido bloqueado por RLS';
exception when insufficient_privilege or check_violation then
  raise notice 'T2 OK -> bloqueado por RLS';
end
$do$;

\echo '--- T3: el cuidador que SI canjeo ve el hogar'
reset role;
set app.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

do $do$
declare v_hogares int; v_meds int;
begin
  select count(*) into v_hogares from public.households;
  select count(*) into v_meds    from public.medications;

  if v_hogares <> 1 then
    raise exception 'T3 FALLO: ve % hogares, esperado 1', v_hogares;
  end if;
  if v_meds < 1 then
    raise exception 'T3 FALLO: no ve los medicamentos del hogar';
  end if;
  raise notice 'T3 OK';
end
$do$;

\echo '--- T4: la vista NO se salta el RLS (security_invoker)'
reset role;
set app.uid = '33333333-3333-3333-3333-333333333333';
set role authenticated;

do $do$
declare v_n int;
begin
  select count(*) into v_n from public.v_adherence_30d;
  if v_n <> 0 then
    raise exception 'T4 FALLO - FUGA: la vista devuelve % filas a un extrano. Falta security_invoker.', v_n;
  end if;
  raise notice 'T4 OK';
end
$do$;

reset role;

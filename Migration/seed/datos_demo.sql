-- =============================================================================
-- seed/datos_demo.sql — Datos de demostracion
-- =============================================================================
-- Rellena el hogar existente con medicamentos e historial de tomas, para que
-- el panel del cuidador muestre algo y el export del modelo de datos tenga
-- filas reales que contar.
--
-- REQUISITO: haber ejecutado antes seed/crear_hogar_admin.sql, que es quien
-- crea el hogar. Aqui no se crea ninguno: sin hogar, avisa y para.
--
-- Corre como postgres desde el SQL Editor de Supabase, asi que se salta el
-- RLS. No forma parte de la migracion y CI no lo ejecuta.
--
-- Idempotente: los identificadores son fijos y todo usa "on conflict do
-- nothing", asi que repetirlo no duplica nada.
-- =============================================================================

do $seed$
declare
  v_home uuid;
  v_zona text;
  v_hoy  date;
  v_med  uuid;
  v_dia  date;
  i      int;
begin
  -- Se toma el hogar mas antiguo: si hay varios, el primero que se creo.
  select id, timezone into v_home, v_zona
    from public.households
   order by created_at
   limit 1;

  if v_home is null then
    raise exception
      'No hay ningun hogar. Ejecuta primero Migration/seed/crear_hogar_admin.sql.';
  end if;

  -- El dia se calcula en la zona del hogar, no en UTC. Con UTC-6, usar
  -- current_date dejaria las tomas de la tarde en el dia equivocado.
  v_hoy := (now() at time zone v_zona)::date;

  -- ---------------------------------------------------------------------
  -- Medicamentos
  -- ---------------------------------------------------------------------
  insert into public.medications
    (id, household_id, name, scheduled_time, expiration_date, quantity)
  values
    ('d0000000-0000-4000-8000-000000000001', v_home,
     'Losartan 50mg',      '06:00', v_hoy + interval '8 months',  45),
    ('d0000000-0000-4000-8000-000000000002', v_home,
     'Metformina 850mg',   '08:00', v_hoy + interval '5 months',  60),
    ('d0000000-0000-4000-8000-000000000003', v_home,
     'Acetaminofen 500mg', '14:00', v_hoy + interval '2 months',  18),
    ('d0000000-0000-4000-8000-000000000004', v_home,
     'Atorvastatina 20mg', '21:00', v_hoy + interval '11 months', 30)
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------
  -- Historial de tomas de los ultimos 30 dias
  --
  -- Se generan con adherencias distintas a proposito, para que la vista
  -- v_adherence_30d muestre porcentajes diferentes y se note que calcula
  -- algo en lugar de devolver siempre lo mismo.
  -- ---------------------------------------------------------------------
  for v_med, i in
    select * from (values
      ('d0000000-0000-4000-8000-000000000001'::uuid, 1),   -- casi perfecto
      ('d0000000-0000-4000-8000-000000000002'::uuid, 3),   -- falla 1 de cada 3
      ('d0000000-0000-4000-8000-000000000003'::uuid, 2)    -- falla 1 de cada 2
    ) as t(med, salto)
  loop
    for v_dia in
      select generate_series(v_hoy - 29, v_hoy, '1 day')::date
    loop
      -- El salto marca los dias en los que NO se tomo.
      continue when (v_dia - (v_hoy - 29)) % (i * 7) = 0;

      insert into public.dose_events (id, medication_id, scheduled_for, taken_at)
      values (
        gen_random_uuid(),
        v_med,
        v_dia,
        (v_dia + time '07:30') at time zone v_zona
      )
      on conflict (medication_id, scheduled_for) where undone_at is null
      do nothing;
    end loop;
  end loop;

  raise notice 'Datos de demostracion listos en el hogar %', v_home;
  raise notice 'Medicamentos: %, eventos: %',
    (select count(*) from public.medications where household_id = v_home),
    (select count(*) from public.dose_events de
       join public.medications m on m.id = de.medication_id
      where m.household_id = v_home);
end
$seed$;

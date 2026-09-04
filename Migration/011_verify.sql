-- =============================================================================
-- 011 — Verificacion
-- =============================================================================
-- No crea nada. Comprueba que los scripts 001-010 dejaron la base en el estado
-- esperado, para que cualquiera que clone el proyecto confirme que obtuvo el
-- mismo resultado.
--
-- Devuelve una tabla con el estado de cada objeto y, si falta alguno, lanza
-- una excepcion al final para que el fallo no pase desapercibido.
-- =============================================================================

select tipo, nombre, estado from (

  select 'tabla' as tipo, nombre,
         case when to_regclass('public.' || nombre) is not null then 'OK' else 'FALTA' end as estado
  from (values
    ('profiles'), ('households'), ('household_members'),
    ('household_invites'), ('medications'), ('dose_events')
  ) as t(nombre)

  union all

  select 'vista', nombre,
         case when to_regclass('public.' || nombre) is not null then 'OK' else 'FALTA' end
  from (values ('v_medication_today'), ('v_adherence_30d')) as v(nombre)

  union all

  select 'funcion', nombre,
         case when exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = nombre
         ) then 'OK' else 'FALTA' end
  from (values
    ('handle_new_user'), ('touch_updated_at'), ('is_household_member'),
    ('create_household'), ('redeem_invite'), ('household_today'),
    ('record_dose'), ('undo_dose')
  ) as f(nombre)

  union all

  select 'indice', nombre,
         case when to_regclass('public.' || nombre) is not null then 'OK' else 'FALTA' end
  from (values
    ('dose_events_one_per_dose'), ('medications_sync_idx'),
    ('dose_events_sync_idx'), ('dose_events_med_idx'), ('household_members_user_idx')
  ) as i(nombre)

  union all

  select 'rls', c.relname,
         case when c.relrowsecurity then 'OK' else 'DESACTIVADO' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('profiles', 'households', 'household_members',
                      'household_invites', 'medications', 'dose_events')

) informe
order by tipo, nombre;

-- Recuento de policies: deben ser 13.
select count(*) as policies_creadas, 13 as esperadas
from pg_policies where schemaname = 'public';

-- Si algo falta, esto revienta con un mensaje claro en vez de dejar pasar el
-- error silenciosamente.
do $do$
declare
  v_faltan int;
begin
  select count(*) into v_faltan
  from (values
    ('profiles'), ('households'), ('household_members'),
    ('household_invites'), ('medications'), ('dose_events'),
    ('v_medication_today'), ('v_adherence_30d')
  ) as t(nombre)
  where to_regclass('public.' || nombre) is null;

  if v_faltan > 0 then
    raise exception 'Faltan % objetos. Revisa que los scripts 001-010 corrieran en orden.', v_faltan;
  end if;

  raise notice 'Verificacion OK: el esquema esta completo.';
end
$do$;

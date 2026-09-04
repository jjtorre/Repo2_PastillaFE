-- =============================================================================
-- 009 — Vistas para la web del cuidador
-- =============================================================================
-- Idempotente: "drop view if exists" antes de crear.
--
-- No se usa "create or replace view" porque falla si cambia la lista de
-- columnas, que es justo lo que pasa al iterar sobre el diseno.
-- =============================================================================

drop view if exists public.v_medication_today;

-- Deriva el estado en vez de leerlo de una columna. Es el equivalente en SQL
-- de computeStatus() de la app.
--
-- security_invoker = on es OBLIGATORIO. Sin eso la vista se ejecutaria con
-- los permisos del owner, saltandose el RLS, y cualquier usuario veria los
-- medicamentos de todas las familias. Requiere PostgreSQL 15 o superior.
create view public.v_medication_today
with (security_invoker = on)
as
select
  m.id,
  m.household_id,
  m.name,
  m.scheduled_time,
  m.expiration_date,
  m.quantity,
  (now() at time zone h.timezone)::date as local_date,
  de.taken_at,
  case
    when de.id is not null then 'taken'
    when (now() at time zone h.timezone)::time > m.scheduled_time then 'late'
    else 'pending'
  end as status
from public.medications m
join public.households h on h.id = m.household_id
left join public.dose_events de
       on de.medication_id = m.id
      and de.scheduled_for = (now() at time zone h.timezone)::date
      and de.undone_at is null
where m.deleted_at is null;

drop view if exists public.v_adherence_30d;

-- Adherencia de los ultimos 30 dias: el dato que el cuidador realmente
-- quiere, y que el modelo original de un solo campo no podia responder.
--
-- LIMITACION CONOCIDA: doses_expected esta fijo en 30 porque cada medicamento
-- tiene una sola hora programada, es decir una dosis diaria. Si algun dia se
-- soporta "cada 8 horas", esta vista necesita una tabla de horarios.
create view public.v_adherence_30d
with (security_invoker = on)
as
select
  m.id as medication_id,
  m.household_id,
  m.name,
  count(de.id) filter (where de.undone_at is null) as doses_taken,
  30 as doses_expected,
  round(100.0 * count(de.id) filter (where de.undone_at is null) / 30, 1) as adherence_pct
from public.medications m
left join public.dose_events de
       on de.medication_id = m.id
      and de.scheduled_for > current_date - interval '30 days'
where m.deleted_at is null
group by m.id, m.household_id, m.name;

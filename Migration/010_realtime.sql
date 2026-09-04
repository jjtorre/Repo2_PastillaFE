-- =============================================================================
-- 010 — Realtime
-- =============================================================================
-- Publica las dos tablas para que la web del cuidador se actualice sola
-- cuando el paciente marca una dosis, sin recargar la pagina.
--
-- Idempotente: "alter publication ... add table" falla si la tabla ya esta
-- publicada, y no admite "if not exists". Se envuelve en un bloque DO que
-- consulta pg_publication_tables antes de anadir.
-- =============================================================================

do $do$
begin
  -- En Supabase la publicacion ya viene creada. Este bloque solo hace falta
  -- para que los scripts corran tambien en un PostgreSQL limpio.
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'medications'
  ) then
    alter publication supabase_realtime add table public.medications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dose_events'
  ) then
    alter publication supabase_realtime add table public.dose_events;
  end if;
end
$do$;

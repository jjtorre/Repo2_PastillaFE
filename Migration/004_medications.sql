-- =============================================================================
-- 004 — Medicamentos
-- =============================================================================
-- Definicion del medicamento + inventario.
--
-- Lo que NO esta aqui es tan importante como lo que si:
--
--   * No hay columna `status`. Es estado derivado (pending / late / taken).
--     Persistirlo crearia una segunda fuente de verdad que se desincroniza
--     entre dispositivos. Se calcula en la vista del script 009.
--   * No hay `last_taken_at`. Guardar solo la ultima toma destruye el
--     historial en cada dosis. El log vive en dose_events (script 005).
--   * `id` no tiene DEFAULT: lo genera el telefono. Asi un medicamento creado
--     sin conexion conserva su identidad al subir.
--
-- Idempotente: "create table if not exists", "create index if not exists".
-- =============================================================================

create table if not exists public.medications (
  id              uuid primary key,                    -- generado en el cliente
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  scheduled_time  time not null,                       -- '08:00' hora local del hogar
  expiration_date date not null,                       -- solo el dia: evita off-by-one
  quantity        integer not null default 0 check (quantity >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Borrado suave. Sin lapida, el otro telefono volveria a subir el
  -- medicamento en su siguiente sincronizacion, resucitandolo.
  deleted_at      timestamptz
);

-- Indice del pull incremental: "dame lo que cambio desde mi cursor".
create index if not exists medications_sync_idx
  on public.medications (household_id, updated_at);

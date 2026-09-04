-- =============================================================================
-- 005 — Log de tomas
-- =============================================================================
-- Tabla de solo-anexar. Cada dosis marcada es una fila nueva, no una
-- sobrescritura. Es lo que permite responder "se la tomo ayer?" y calcular
-- adherencia, preguntas que el modelo original de un solo campo no podia
-- contestar porque destruia el dato anterior en cada toma.
--
-- Idempotente: "create table if not exists", "create index if not exists".
-- =============================================================================

create table if not exists public.dose_events (
  id            uuid primary key,                      -- generado en el cliente
  medication_id uuid not null references public.medications(id) on delete cascade,
  scheduled_for date not null,                         -- la dosis de QUE dia
  taken_at      timestamptz not null default now(),
  undone_at     timestamptz,                           -- permite desmarcar
  created_by    uuid references public.profiles(id),
  device_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- PIEZA CLAVE DE LA SINCRONIZACION.
--
-- Una sola toma vigente por dosis programada. Combinado con record_dose()
-- (script 008), hace que subir una toma sea IDEMPOTENTE: si el telefono
-- pierde senal a mitad del envio y reintenta, la segunda llamada detecta el
-- conflicto y NO vuelve a descontar inventario.
--
-- Es un indice PARCIAL ("where undone_at is null"), asi que desmarcar y
-- volver a marcar sigue funcionando: la fila vieja queda con undone_at y sale
-- del indice.
create unique index if not exists dose_events_one_per_dose
  on public.dose_events (medication_id, scheduled_for)
  where undone_at is null;

create index if not exists dose_events_sync_idx
  on public.dose_events (updated_at);

create index if not exists dose_events_med_idx
  on public.dose_events (medication_id, scheduled_for);

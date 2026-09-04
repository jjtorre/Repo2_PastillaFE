-- =============================================================================
-- 001 — Extensiones
-- =============================================================================
-- pgcrypto aporta gen_random_uuid(), que usan los DEFAULT de households y de
-- household_invites. Las tablas que crea el cliente (medications, dose_events)
-- NO llevan default: su id se genera en el telefono.
--
-- Idempotente: "if not exists".
-- =============================================================================

create extension if not exists pgcrypto;

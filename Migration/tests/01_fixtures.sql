-- =============================================================================
-- tests/01 — Datos de prueba
-- =============================================================================
-- Se insertan como postgres (superusuario, salta el RLS) para poder fijar
-- UUID deterministas. Los tests posteriores SI se ejecutan como
-- 'authenticated', que es donde el RLS cuenta.
--
-- Idempotente: "on conflict do nothing" en todo.
-- =============================================================================

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'paciente@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'cuidador@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'extrano@test.local')
on conflict (id) do nothing;

-- El hogar de prueba. Zona horaria UTC-6 a proposito: es la que destapo el
-- bug de las dosis de la noche atribuidas al dia siguiente.
insert into public.households (id, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Familia de prueba', 'America/Tegucigalpa')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'patient')
on conflict (household_id, user_id) do nothing;

insert into public.medications
  (id, household_id, name, scheduled_time, expiration_date, quantity)
values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Paracetamol', '08:00', '2030-01-01', 30)
on conflict (id) do nothing;

insert into public.household_invites (code, household_id, role, expires_at) values
  ('ABC234', 'aaaaaaaa-0000-0000-0000-000000000001', 'caregiver', now() + interval '7 days'),
  ('OLD999', 'aaaaaaaa-0000-0000-0000-000000000001', 'caregiver', now() - interval '1 day')
on conflict (code) do nothing;

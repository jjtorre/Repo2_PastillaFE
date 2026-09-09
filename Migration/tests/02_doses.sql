-- =============================================================================
-- tests/02 — Registro de dosis
-- =============================================================================
-- Lo que se protege aqui: que un reintento de red no descuente inventario dos
-- veces, y que el dia de la dosis salga de la zona horaria del HOGAR y no del
-- reloj del servidor.
--
-- Cada prueba lanza excepcion si falla, para que psql salga con codigo != 0 y
-- CI se ponga en rojo.
-- =============================================================================

set app.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;

\echo '--- T1: inventario inicial = 30'
do $do$
declare v_qty int;
begin
  select quantity into v_qty from public.medications
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_qty <> 30 then raise exception 'T1 FALLO: inventario = %, esperado 30', v_qty; end if;
  raise notice 'T1 OK';
end
$do$;

\echo '--- T2: la primera toma descuenta una pastilla'
do $do$
declare v_qty int;
begin
  perform public.record_dose('bbbbbbbb-0000-0000-0000-000000000001');
  select quantity into v_qty from public.medications
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_qty <> 29 then raise exception 'T2 FALLO: inventario = %, esperado 29', v_qty; end if;
  raise notice 'T2 OK';
end
$do$;

\echo '--- T3: IDEMPOTENCIA - tres reintentos NO descuentan de mas'
do $do$
declare v_qty int; v_eventos int;
begin
  perform public.record_dose('bbbbbbbb-0000-0000-0000-000000000001');
  perform public.record_dose('bbbbbbbb-0000-0000-0000-000000000001');
  perform public.record_dose('bbbbbbbb-0000-0000-0000-000000000001');

  select quantity into v_qty from public.medications
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_qty <> 29 then
    raise exception 'T3 FALLO: inventario = %, esperado 29. El reintento descuenta de mas.', v_qty;
  end if;

  select count(*) into v_eventos from public.dose_events
   where medication_id = 'bbbbbbbb-0000-0000-0000-000000000001' and undone_at is null;
  if v_eventos <> 1 then
    raise exception 'T3 FALLO: % eventos vigentes, esperado 1', v_eventos;
  end if;

  raise notice 'T3 OK';
end
$do$;

\echo '--- T4: la fecha de la dosis sale de la zona horaria del hogar'
do $do$
declare v_dia date; v_esperado date;
begin
  select scheduled_for into v_dia from public.dose_events
   where medication_id = 'bbbbbbbb-0000-0000-0000-000000000001' and undone_at is null;

  select (now() at time zone h.timezone)::date into v_esperado
    from public.households h
   where h.id = 'aaaaaaaa-0000-0000-0000-000000000001';

  if v_dia <> v_esperado then
    raise exception 'T4 FALLO: dosis guardada el %, el hogar esta a dia %', v_dia, v_esperado;
  end if;
  raise notice 'T4 OK (dia del hogar: %, UTC: %)', v_dia, current_date;
end
$do$;

\echo '--- T5: la vista la reporta como tomada'
do $do$
declare v_status text;
begin
  select status into v_status from public.v_medication_today
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_status <> 'taken' then
    raise exception 'T5 FALLO: status = %, esperado taken', v_status;
  end if;
  raise notice 'T5 OK';
end
$do$;

\echo '--- T6: deshacer devuelve la pastilla al inventario'
do $do$
declare v_qty int;
begin
  perform public.undo_dose('bbbbbbbb-0000-0000-0000-000000000001');
  select quantity into v_qty from public.medications
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_qty <> 30 then raise exception 'T6 FALLO: inventario = %, esperado 30', v_qty; end if;
  raise notice 'T6 OK';
end
$do$;

\echo '--- T7: se puede volver a marcar tras deshacer (indice parcial)'
do $do$
declare v_qty int; v_total int;
begin
  perform public.record_dose('bbbbbbbb-0000-0000-0000-000000000001');
  select quantity into v_qty from public.medications
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_qty <> 29 then raise exception 'T7 FALLO: inventario = %, esperado 29', v_qty; end if;

  -- El historial conserva ambos eventos: el deshecho y el nuevo.
  select count(*) into v_total from public.dose_events
   where medication_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if v_total < 2 then raise exception 'T7 FALLO: el historial perdio eventos (%)', v_total; end if;

  raise notice 'T7 OK';
end
$do$;

\echo '--- T8: el borrado suave saca el medicamento de la vista pero no de la tabla'
do $do$
declare v_tabla int; v_vista int;
begin
  update public.medications set deleted_at = now()
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';

  select count(*) into v_tabla from public.medications
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  select count(*) into v_vista from public.v_medication_today
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';

  if v_tabla <> 1 then raise exception 'T8 FALLO: la fila desaparecio de la tabla'; end if;
  if v_vista <> 0 then raise exception 'T8 FALLO: sigue visible en la vista'; end if;

  update public.medications set deleted_at = null
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  raise notice 'T8 OK';
end
$do$;

reset role;

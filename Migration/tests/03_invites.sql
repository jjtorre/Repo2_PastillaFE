-- =============================================================================
-- tests/03 — Canje de invitaciones
-- =============================================================================
-- redeem_invite() tiene que ser idempotente para el MISMO usuario: recargar la
-- pagina o reintentar tras un fallo de red no puede parecerle al cuidador que
-- su codigo es invalido.
--
-- Y los tres motivos de rechazo deben distinguirse, para que sepa si se
-- equivoco al teclear, si alguien mas uso el codigo o si caduco.
-- =============================================================================

set app.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

\echo '--- T1: primer canje'
do $do$
declare h uuid;
begin
  h := public.redeem_invite('ABC234');
  if h <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    raise exception 'T1 FALLO: devolvio %', h;
  end if;
  raise notice 'T1 OK';
end
$do$;

\echo '--- T2: IDEMPOTENCIA - el mismo usuario canjea tres veces'
do $do$
declare h1 uuid; h2 uuid; h3 uuid;
begin
  h1 := public.redeem_invite('ABC234');
  h2 := public.redeem_invite('ABC234');
  h3 := public.redeem_invite('ABC234');
  if h1 is distinct from h2 or h2 is distinct from h3 then
    raise exception 'T2 FALLO: % / % / %', h1, h2, h3;
  end if;
  raise notice 'T2 OK';
end
$do$;

\echo '--- T3: no se duplicaron las membresias'
do $do$
declare v_n int;
begin
  select count(*) into v_n from public.household_members
   where household_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222';
  if v_n <> 1 then raise exception 'T3 FALLO: % filas de membresia, esperado 1', v_n; end if;
  raise notice 'T3 OK';
end
$do$;

reset role;
set app.uid = '33333333-3333-3333-3333-333333333333';
set role authenticated;

\echo '--- T4: otro usuario con un codigo ya usado'
do $do$
begin
  perform public.redeem_invite('ABC234');
  raise exception 'T4 FALLO: deberia haber sido rechazado';
exception when others then
  if sqlerrm not like '%ya utilizada%' then
    raise exception 'T4 FALLO: mensaje inesperado -> %', sqlerrm;
  end if;
  raise notice 'T4 OK -> %', sqlerrm;
end
$do$;

\echo '--- T5: codigo caducado'
do $do$
begin
  perform public.redeem_invite('OLD999');
  raise exception 'T5 FALLO: deberia haber sido rechazado';
exception when others then
  if sqlerrm not like '%expirada%' then
    raise exception 'T5 FALLO: mensaje inesperado -> %', sqlerrm;
  end if;
  raise notice 'T5 OK -> %', sqlerrm;
end
$do$;

\echo '--- T6: codigo inexistente'
do $do$
begin
  perform public.redeem_invite('NOPE99');
  raise exception 'T6 FALLO: deberia haber sido rechazado';
exception when others then
  if sqlerrm not like '%invalida%' then
    raise exception 'T6 FALLO: mensaje inesperado -> %', sqlerrm;
  end if;
  raise notice 'T6 OK -> %', sqlerrm;
end
$do$;

reset role;

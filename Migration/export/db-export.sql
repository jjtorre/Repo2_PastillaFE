-- =============================================================================
-- export/db-export.sql — Exporta el modelo de datos REAL a JSON
-- =============================================================================
-- Lee el esquema vivo del catalogo de PostgreSQL: tablas, columnas, tipos,
-- llaves primarias, indices, llaves foraneas, politicas de acceso y el numero
-- real de filas de cada tabla.
--
-- No hay nada escrito a mano. Si el esquema cambia, el export cambia solo, que
-- es justo lo que hace que el documento siga siendo cierto dentro de un mes.
--
-- COMO USARLO
--   1. Pegalo en el SQL Editor de Supabase y ejecutalo.
--   2. Copia el unico valor que devuelve (la columna "export").
--   3. Guardalo como docs/db-export.json en el repositorio.
--
-- El recuento de filas usa query_to_xml porque no se puede hacer
-- "select count(*) from <variable>" en SQL plano: hace falta ejecutar una
-- consulta construida por tabla, y esta es la forma de conseguirlo sin
-- recurrir a PL/pgSQL.
-- =============================================================================

with tablas as (
  select c.oid, c.relname as nombre
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'          -- solo tablas, ni vistas ni secuencias
),

filas as (
  select t.nombre,
         (xpath(
            '/row/cnt/text()',
            query_to_xml(format('select count(*) as cnt from public.%I', t.nombre),
                         false, true, '')
          ))[1]::text::bigint as total
    from tablas t
),

-- Columnas que forman la llave primaria de cada tabla.
pks as (
  select con.conrelid as oid, unnest(con.conkey) as attnum
    from pg_constraint con
   where con.contype = 'p'
),

columnas as (
  select t.nombre,
         jsonb_agg(
           jsonb_build_object(
             'nombre', a.attname,
             'tipo',   format_type(a.atttypid, a.atttypmod),
             'pk',     (pk.attnum is not null),
             'nulo',   not a.attnotnull
           )
           order by a.attnum
         ) as cols
    from tablas t
    join pg_attribute a on a.attrelid = t.oid
    left join pks pk on pk.oid = t.oid and pk.attnum = a.attnum
   where a.attnum > 0 and not a.attisdropped
   group by t.nombre
),

indices as (
  select t.nombre, jsonb_agg(ic.relname order by ic.relname) as idx
    from tablas t
    join pg_index i on i.indrelid = t.oid
    join pg_class ic on ic.oid = i.indexrelid
   group by t.nombre
),

relaciones as (
  select t.nombre,
         jsonb_agg(
           jsonb_build_object(
             'columna',    att.attname,
             'referencia', reft.relname || '.' || refatt.attname
           )
           order by att.attname
         ) as rels
    from tablas t
    join pg_constraint con on con.conrelid = t.oid and con.contype = 'f'
    join lateral unnest(con.conkey, con.confkey) as k(col, refcol) on true
    join pg_attribute att    on att.attrelid = con.conrelid  and att.attnum = k.col
    join pg_class     reft   on reft.oid = con.confrelid
    join pg_attribute refatt on refatt.attrelid = con.confrelid and refatt.attnum = k.refcol
   group by t.nombre
),

politicas as (
  select t.nombre, jsonb_agg(p.polname order by p.polname) as pol
    from tablas t
    join pg_policy p on p.polrelid = t.oid
   group by t.nombre
)

select jsonb_pretty(
  jsonb_build_object(
    'generado_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'motor',       'postgres',
    'tablas',      jsonb_agg(
                     jsonb_build_object(
                       'nombre',         t.nombre,
                       'filas',          f.total,
                       'columnas',       c.cols,
                       'indices',        coalesce(i.idx,  '[]'::jsonb),
                       'relaciones',     coalesce(r.rels, '[]'::jsonb),
                       'politicas_rls',  coalesce(p.pol,  '[]'::jsonb)
                     )
                     order by t.nombre
                   )
  )
) as export
from tablas t
join filas      f on f.nombre = t.nombre
join columnas   c on c.nombre = t.nombre
left join indices    i on i.nombre = t.nombre
left join relaciones r on r.nombre = t.nombre
left join politicas  p on p.nombre = t.nombre;

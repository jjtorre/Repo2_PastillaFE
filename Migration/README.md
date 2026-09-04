# Migración de base de datos — Pastilla

Scripts SQL para reconstruir el esquema completo en Supabase desde cero.

Se ejecutan **en orden numérico** y son **idempotentes**: correrlos dos veces
deja exactamente el mismo resultado que correrlos una, sin errores. Eso
permite reintentar sin miedo si algo se interrumpe a mitad.

---

## Requisitos

- Un proyecto de Supabase (el plan gratuito basta).
- PostgreSQL **15 o superior** — las vistas usan `security_invoker`, que no
  existe en versiones anteriores. Supabase ya cumple.

---

## Cómo ejecutarlos

### Opción A — SQL Editor de Supabase (recomendada)

Dashboard → **SQL Editor** → New query. Pega el contenido de cada archivo y
pulsa **Run**, uno por uno y **en orden**:

```
001_extensions.sql
002_profiles.sql
003_households.sql
004_medications.sql
005_dose_events.sql
006_triggers.sql
007_rls.sql
008_functions.sql
009_views.sql
010_realtime.sql
011_verify.sql
```

El último no crea nada: comprueba el resultado y falla con un mensaje claro si
falta algún objeto.

### Opción B — psql

```bash
export PGURL="postgresql://postgres:[TU-PASSWORD]@db.[TU-REF].supabase.co:5432/postgres"

for f in Migration/0*.sql; do
  echo ">>> $f"
  psql "$PGURL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

La cadena de conexión está en Project Settings → Database → Connection string.

---

## Qué hace cada script

| Script | Contenido |
|---|---|
| `001_extensions.sql` | `pgcrypto`, para `gen_random_uuid()` |
| `002_profiles.sql` | Perfil público colgado de `auth.users` + trigger de alta |
| `003_households.sql` | Hogares, miembros e invitaciones |
| `004_medications.sql` | Definición del medicamento e inventario |
| `005_dose_events.sql` | Log de tomas + índice único que hace idempotente el sync |
| `006_triggers.sql` | `updated_at` gestionado por el servidor |
| `007_rls.sql` | Row Level Security: 13 policies |
| `008_functions.sql` | RPC: crear hogar, canjear invitación, marcar/desmarcar dosis |
| `009_views.sql` | Vistas para la web del cuidador |
| `010_realtime.sql` | Publicación de cambios en tiempo real |
| `011_verify.sql` | Verificación del resultado (no modifica nada) |

---

## Después de los scripts

**1. Activa las sesiones anónimas.** Authentication → Sign In / Providers →
**Anonymous sign-ins: ON**. El paciente entra sin registrarse; sin esto la
sincronización no arranca.

**2. Configura la app:**

```bash
cd myApp
cp .env.example .env.local     # rellena URL y clave anon
npx expo start --clear         # --clear es necesario: Expo cachea las variables
```

Los valores están en Project Settings → API: **Project URL** y la clave
**`anon` / `public`**. La clave `service_role` **no** va aquí nunca: salta el
RLS por completo.

---

## Cómo está pensado el modelo

Tres decisiones explican casi todo el esquema:

**El estado no se guarda, se deriva.** No hay columna `status`. Persistir si
una dosis está tomada crearía una segunda fuente de verdad que se desincroniza
entre dispositivos. Se calcula en `v_medication_today`.

**El historial es un log, no un campo.** `dose_events` solo anexa filas. Un
único campo «última toma» se sobrescribe en cada dosis y destruye el pasado,
que es justo lo que el cuidador necesita consultar.

**Las fechas son del hogar, no del servidor.** Cada hogar tiene su zona
horaria y `household_today()` la aplica. Con UTC−6, derivar el día desde UTC
guardaría toda dosis tomada después de las 6pm con la fecha del día siguiente.

## Nota sobre idempotencia

| Objeto | Técnica |
|---|---|
| Tablas, índices, extensiones | `create ... if not exists` |
| Funciones | `create or replace function` |
| Triggers, policies | `drop ... if exists` y volver a crear |
| Vistas | `drop view if exists` (`create or replace` falla si cambian las columnas) |
| Publicación realtime | Bloque `do` que consulta `pg_publication_tables` |

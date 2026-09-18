# Pastilla

Sistema de seguimiento de medicación para personas mayores que viven solas.

Dos mitades que se complementan: una **app móvil** para quien toma los
medicamentos, y un **panel web** para el familiar que se preocupa por él. El
teléfono funciona sin internet; el panel se actualiza solo cuando hay conexión.

---
LEARN-CAP-C366ADC1
## El problema

Cuando alguien mayor vive solo, la familia acaba llamando cada día para
preguntar lo mismo: «¿ya te tomaste la pastilla?». La respuesta depende de la
memoria de quien contesta, que es justo lo que falla.

---

## Estructura del repositorio

| Carpeta | Qué es | Stack |
|---|---|---|
| [`myApp/`](myApp/) | App móvil del paciente | Expo SDK 54, React Native 0.81, TypeScript |
| [`web/`](web/) | Panel del cuidador + landing pública | Vite 8, React 19, TypeScript |
| [`Migration/`](Migration/) | Esquema de base de datos y sus pruebas | PostgreSQL 15 / Supabase |
| [`.github/workflows/`](.github/workflows/) | Integración continua | GitHub Actions |

Cada carpeta tiene su propio README con el detalle.

---

## Arquitectura

```mermaid
flowchart LR
  subgraph telefono["📱 Teléfono del paciente"]
    UI["Pantallas"] --> ST["storage.ts"]
    ST --> AS[("AsyncStorage")]
    ST --> OB["Outbox<br/>(cola pendiente)"]
    OB --> SY["sync.ts"]
  end

  SY <-->|"push / pull"| SB[("Supabase<br/>PostgreSQL + RLS")]
  SB -->|"vistas + realtime"| WEB["🖥️ Panel del cuidador"]
```

El teléfono es la **fuente de verdad inmediata**. Toda escritura se aplica
primero en `AsyncStorage` y además se encola; sincronizar es un efecto de
fondo que la interfaz nunca espera.

---

## Puesta en marcha

### 1. Base de datos

Crea un proyecto en [Supabase](https://supabase.com) y ejecuta los 11 scripts
de [`Migration/`](Migration/) **en orden numérico** desde el SQL Editor. Son
idempotentes: repetirlos no rompe nada.

Después, en el dashboard: **Authentication → Sign In / Providers →
Anonymous sign-ins: ON**. El paciente entra sin registrarse, y sin esto la
sincronización no arranca.

Detalle completo en [`Migration/README.md`](Migration/README.md).

### 2. App móvil

```bash
cd myApp
npm install
cp .env.example .env.local     # rellena URL y clave anon
npx expo start --android       # o --ios
```

### 3. Panel web

```bash
cd web
npm install
cp .env.example .env.local     # los MISMOS valores, con prefijo VITE_
npm run dev
```

Los valores salen de **Project Settings → API**: *Project URL* y la clave
**`anon`**. La clave `service_role` no va en ninguno de los dos — esa sí se
salta la seguridad por completo.

---

## Cómo se conectan las dos mitades

```
1. El paciente registra sus medicinas en la app
2. Abre «Vista de cuidador» → «Invitar a un cuidador»
3. Le dicta el código de 6 caracteres a su familiar
4. El familiar entra en la web, crea su cuenta y escribe el código
5. Ya ve el estado del día, y se actualiza solo
```

El paso 4 no es un trámite: **tener cuenta no da acceso a nada**. La seguridad
a nivel de fila exige pertenecer al hogar, así que hasta canjear el código
todas las consultas devuelven cero filas.

---

## Decisiones de diseño

Cuatro elecciones explican casi todo el código.

**El estado no se guarda, se deriva.** No hay columna `status`. Persistir si
una dosis está tomada crearía una segunda fuente de verdad que se desincroniza
entre dispositivos. Se calcula al consultar.

**El historial es un log, no un campo.** `dose_events` solo añade filas. Un
único campo «última toma» se sobrescribe en cada dosis y destruye el pasado,
que es precisamente lo que el cuidador necesita consultar.

**Las fechas son del hogar, no del servidor.** Cada hogar tiene su zona
horaria. Con UTC−6, derivar el día desde UTC guardaría toda dosis tomada
después de las 6 de la tarde con la fecha del día siguiente — y el panel la
reportaría como atrasada cuando acaba de tomarse.

**Repetir una operación es seguro.** Un índice único parcial sobre las dosis
vigentes hace que un reintento por mala cobertura no descuente inventario dos
veces. Lo mismo al canjear un código: hacerlo dos veces devuelve el hogar en
vez de fallar.

---

## Integración continua

Tres flujos de trabajo, filtrados por ruta para que un cambio en una carpeta
no arrastre a las demás.

| Flujo | Qué comprueba |
|---|---|
| `ci-database.yml` | Levanta PostgreSQL 15, aplica los scripts **dos veces** y corre las pruebas de comportamiento |
| `ci-app.yml` | Tipos de la app y que el bundle de Metro resuelva |
| `ci-web.yml` | Lint y build de producción del panel |

El de base de datos es el que aporta valor real: los otros confirman que
compila, ese confirma que **se comporta**. Verifica que las dosis repetidas no
descuenten de más, que las fechas salgan de la zona horaria correcta y que un
usuario ajeno no vea ni una fila.

Las pruebas corren como rol `authenticated`, nunca como `postgres`: el
superusuario se salta la seguridad por fila, así que las pruebas de aislamiento
darían verde siempre.

---

## Despliegue

El panel web se despliega en Vercel con **Root Directory = `web`**, añadiendo
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno.

Un detalle que se olvida siempre: en **Supabase → Authentication → URL
Configuration** hay que añadir el dominio de producción. Sin eso, los correos
de confirmación apuntan a `localhost` y el acceso queda roto en producción
aunque el despliegue se vea perfecto.

---

## Licencia y contexto

Proyecto académico de ingeniería de software. No es un producto médico y no
debe usarse como única fuente de control de una medicación real.

# Panel del cuidador

Página web para que el cuidador vea, desde cualquier navegador y sin instalar
nada, si su familiar ya tomó los medicamentos de hoy.

Vite + React + TypeScript. Consume el mismo proyecto de Supabase que la app
móvil de [`../myApp`](../myApp), con la misma clave anon.

---
LEARN-CAP-C366ADC1
## Puesta en marcha

Requiere que el esquema esté aplicado: ver [`../Migration/README.md`](../Migration/README.md).

```bash
cd web
npm install
cp .env.example .env.local     # rellena los dos valores
npm run dev
```

Son los **mismos valores** que `myApp/.env.local`, solo que Vite exige el
prefijo `VITE_` en lugar de `EXPO_PUBLIC_`.

## Despliegue en Vercel

Importa el repositorio y configura:

| Ajuste | Valor |
|---|---|
| Root Directory | `web` |
| Framework Preset | Vite |
| Environment Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

El [`vercel.json`](vercel.json) ya incluye el `rewrite` a `/`, necesario
porque es una SPA: sin él, recargar en cualquier ruta daría 404.

---

## Cómo entra un cuidador

```
1. Crea su cuenta (correo + contraseña)
2. El paciente abre la app → «Vista de cuidador» → «Invitar a un cuidador»
3. El paciente le dicta el código de 6 caracteres
4. El cuidador lo escribe aquí → redeem_invite() lo une al hogar
5. Ya ve el panel
```

El paso 4 no es un trámite: **tener cuenta no da acceso a nada**. El RLS exige
pertenecer al hogar, así que hasta canjear el código todas las consultas
devuelven cero filas. Por eso hay una pantalla dedicada explicándolo, en lugar
de un panel vacío sin motivo aparente.

## Idempotencia

Coherente con los scripts de `Migration/`, repetir cualquier operación es
seguro:

| Operación | Comportamiento al repetirse |
|---|---|
| Canjear un código ya canjeado **por ti** | Devuelve tu hogar, sin error |
| Canjear un código usado por **otra persona** | Error explícito: «invitacion ya utilizada» |
| Canjear un código caducado | Error explícito: «invitacion expirada» |
| Recargar el panel | Solo lectura, sin efectos |

El primer caso es el que importa: recargar esta página o reintentar tras un
fallo de red no debe parecer que el código es inválido. La garantía vive en
`redeem_invite()`, en [`../Migration/008_functions.sql`](../Migration/008_functions.sql).

## Estructura

```
src/
├── lib/supabase.ts    cliente (misma clave anon que la app)
├── lib/types.ts       formas de las VISTAS, no de las tablas
├── App.tsx            enrutado por estado: sesión → hogar → panel
└── pages/
    ├── Login.tsx          correo y contraseña
    ├── JoinHousehold.tsx  canje del código
    └── Dashboard.tsx      estado del día + adherencia, con realtime
```

Los tipos **no se comparten** con `myApp`: la app lee las tablas y la web lee
las vistas `v_medication_today` y `v_adherence_30d`, que tienen forma distinta.
Montar un workspace de npm para compartir código añadiría fricción de build a
cambio de casi nada.

## Tiempo real

El panel se suscribe a `medications` y `dose_events`. Cuando el paciente marca
una dosis en su teléfono, la pantalla se actualiza sola: el cuidador no tiene
que recordar recargar, que es la fricción que hace que la gente deje de mirar
un panel.

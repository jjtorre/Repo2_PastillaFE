# Arquitectura — Pastilla

Documento de arquitectura del sistema de seguimiento de medicación, siguiendo
el modelo **C4** en sus dos primeros niveles.

Cliente: **Ozman Carias**, que necesita llevar el control de la medicación de
dos familiares mayores — su suegra y su abuela.

---

## Nivel 1 — Contexto del sistema

Quién usa el sistema y con qué se relaciona.

```mermaid
C4Context
    title Contexto del sistema — Pastilla

    Person(paciente, "Paciente", "Persona mayor que vive sola y toma medicación a diario. Usa su propio teléfono.")
    Person(cuidador, "Cuidador", "Familiar a cargo. Quiere saber si su pariente ya tomó lo de hoy, sin instalar nada.")

    System(pastilla, "Pastilla", "Registra medicamentos, controla inventario y permite monitoreo remoto del cumplimiento.")

    System_Ext(supabase, "Supabase", "PostgreSQL gestionado, autenticación y canal de tiempo real.")
    System_Ext(vercel, "Vercel", "Hospedaje del panel web y de la función de healthcheck.")

    Rel(paciente, pastilla, "Registra medicinas y marca cada dosis", "App móvil")
    Rel(cuidador, pastilla, "Consulta el estado del día y la adherencia", "Navegador")
    Rel(pastilla, supabase, "Sincroniza y consulta", "HTTPS / WebSocket")
    Rel(pastilla, vercel, "Se sirve desde", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

**La asimetría entre los dos actores es la que define el sistema.** El paciente
usa el teléfono a diario, puede no tener buena señal y no debería enfrentarse a
un registro ni a una contraseña. El cuidador entra desde cualquier navegador,
tiene cuenta real y solo consulta. Esa diferencia explica por qué una mitad es
app nativa y la otra una página web.

---

## Nivel 2 — Contenedores

Las piezas desplegables y cómo se comunican.

```mermaid
flowchart TB
    subgraph tel["📱 Teléfono del paciente"]
        ui["Pantallas<br/><i>React Native · Expo</i>"]
        api["storage.ts<br/><i>API de persistencia</i>"]
        local[("AsyncStorage<br/><i>fuente de verdad inmediata</i>")]
        cola["Outbox<br/><i>cola persistente</i>"]
        motor["sync.ts<br/><i>motor de sincronización</i>"]

        ui --> api
        api --> local
        api --> cola
        cola --> motor
    end

    subgraph nube["☁️ Supabase"]
        pg[("PostgreSQL<br/><i>RLS por hogar</i>")]
        auth["Auth<br/><i>anónima y por correo</i>"]
        rt["Realtime"]
    end

    subgraph web["🖥️ Navegador del cuidador"]
        landing["Landing pública"]
        panel["Panel privado<br/><i>/panel</i>"]
        cuenta["Gestión de cuenta<br/><i>/panel/cuenta</i>"]
    end

    salud["/api/health<br/><i>función serverless</i>"]

    motor <-->|"subir y bajar"| pg
    motor --> auth
    panel -->|"lee vistas derivadas"| pg
    cuenta --> pg
    panel <-.->|"se actualiza solo"| rt
    salud -->|"sonda sin sesión"| pg

    style local fill:#E8EFE9,stroke:#2D6E5E,color:#1F3A3D
    style pg fill:#E8EFE9,stroke:#2D6E5E,color:#1F3A3D
    style cola fill:#FBEAE3,stroke:#D4683A,color:#1F3A3D
```

| Contenedor | Tecnología | Responsabilidad |
|---|---|---|
| App móvil | Expo SDK 54, React Native 0.81, TypeScript | Registro, marcado de dosis e inventario. Funciona sin red |
| Panel web | Vite 8, React 19, TypeScript | Consulta del estado del día y gestión de la cuenta |
| Base de datos | PostgreSQL 15 sobre Supabase | Dato compartido, reglas de acceso y estado derivado |
| Healthcheck | Función serverless en Vercel | Comprueba que la base responde y que el aislamiento sigue activo |

---

## Flujo crítico — marcar una dosis

El camino que más se ejecuta, y el que no puede fallar.

```mermaid
sequenceDiagram
    participant P as Paciente
    participant UI as Pantalla
    participant S as storage.ts
    participant L as AsyncStorage
    participant O as Outbox
    participant DB as PostgreSQL

    P->>UI: toca el círculo
    UI->>S: updateMedication(id, status taken)
    S->>L: escribe
    S->>O: encola evento de dosis
    S-->>UI: responde
    UI-->>P: ✓ marcado

    Note over S,O: La interfaz nunca espera a la red

    rect rgb(232, 239, 233)
        Note over O,DB: Más tarde, cuando hay conexión
        O->>DB: record_dose()
        DB->>DB: registra evento y descuenta inventario<br/>en una transacción
        DB-->>O: idempotente ante reintentos
    end
```

La separación entre las dos mitades es la decisión central del sistema, y está
documentada en [ADR-001](adr/ADR-001-offline-first-con-cola-de-salida.md).

---

## Modelo de datos

```mermaid
erDiagram
    households ||--o{ household_members : "tiene"
    households ||--o{ medications : "contiene"
    households ||--o{ household_invites : "emite"
    profiles ||--o{ household_members : "pertenece a"
    medications ||--o{ dose_events : "registra"

    households {
        uuid id PK
        text name
        text timezone "de aquí salen las fechas"
    }
    household_members {
        uuid household_id FK
        uuid user_id FK
        text role "patient, admin, caregiver"
        timestamptz disabled_at "retira el acceso"
    }
    medications {
        uuid id PK "generado en el dispositivo"
        time scheduled_time
        integer quantity
        timestamptz deleted_at "lápida"
    }
    dose_events {
        uuid id PK
        date scheduled_for
        timestamptz taken_at
        timestamptz undone_at
    }
```

Dos ausencias son deliberadas: `medications` **no** guarda si la dosis está
tomada, y `dose_events` **no** se sobrescribe. El estado se deriva al
consultar y el historial solo crece.

---

## Atributos de calidad priorizados

| Atributo | Cómo se consigue | Qué se cedió |
|---|---|---|
| **Disponibilidad sin red** | Escritura local primero y cola de salida | Consistencia inmediata ([ADR-001](adr/ADR-001-offline-first-con-cola-de-salida.md)) |
| **Confidencialidad** | Reglas de acceso por fila en la base de datos | Facilidad de depuración ([ADR-002](adr/ADR-002-seguridad-en-la-base-de-datos.md)) |
| **Corrección ante reintentos** | Índice único parcial sobre las dosis vigentes | Una escritura más compleja |
| **Trazabilidad** | Nada se borra: lápidas y registros de acceso | Crecimiento de las tablas |

---

## Decisiones de arquitectura

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](adr/ADR-001-offline-first-con-cola-de-salida.md) | Arquitectura offline-first con cola de salida en el dispositivo | Aceptada |
| [ADR-002](adr/ADR-002-seguridad-en-la-base-de-datos.md) | Seguridad a nivel de fila en la base de datos como único control de acceso | Aceptada |

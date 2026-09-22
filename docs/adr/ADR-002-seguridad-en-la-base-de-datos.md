# ADR-002: Seguridad a nivel de fila en la base de datos como único control de acceso

- **Estado:** Aceptada
- **Fecha:** 2026-09-22
- **Decisores:** equipo de desarrollo

---

## Contexto

El sistema maneja datos médicos de personas mayores: qué medicamentos toman, a
qué hora y si cumplen el tratamiento. Cada familia debe ver lo suyo y nada más.

La arquitectura elegida en [ADR-001](ADR-001-offline-first-con-cola-de-salida.md)
impone una restricción que condiciona todo lo demás: **la app móvil y el panel
web hablan directamente con la base de datos**, sin un servidor propio en
medio. No hay ninguna capa donde poner comprobaciones.

Y hay un hecho que no se puede evitar: la clave de acceso a la API viaja dentro
de los clientes. Expo la incrusta en el paquete de la app y Vite en el bundle
del navegador. Cualquiera que instale la app o abra las herramientas de
desarrollo puede extraerla. **No es un descuido que se pueda corregir: es cómo
funcionan estas plataformas.**

Eso descarta de raíz la opción habitual de filtrar los datos en el cliente. Un
`where household_id = ...` escrito en la app no protege nada: quien tenga la
clave puede pedirle a la API lo que quiera, saltándose la aplicación entera.

---

## Decisión

**Toda la autorización vive en la base de datos**, mediante seguridad a nivel de
fila. Las consultas de los clientes no filtran por permisos: filtran por lo que
quieren mostrar, y la base decide qué pueden ver.

Se concreta así:

- **Todas las tablas tienen la seguridad por fila activada.** Sin políticas que
  lo permitan explícitamente, una consulta devuelve cero filas.
- **Una única función decide la pertenencia.** Todas las políticas pasan por
  ella, así que retirarle el acceso a alguien es **una sola condición** y no una
  lista de sitios que recordar actualizar.
- **Las vistas se ejecutan con los permisos de quien consulta**
  (`security_invoker`). Sin eso correrían como su propietario y filtrarían
  datos de todas las familias.
- **Las reglas condicionales van en funciones del servidor**, no en políticas,
  porque una política solo sabe responder sí o no. Ahí viven invariantes como
  «nadie puede retirarse el acceso a sí mismo» o «el hogar no puede quedarse sin
  administrador».
- **Las pruebas se ejecutan como usuario normal, nunca como superusuario**, que
  se salta estas reglas y daría verde siempre.

---

## Consecuencias

### Positivas

- **La garantía no depende del cliente.** Da igual si la petición viene de la
  app, del navegador, de `curl` o de un cliente que alguien escriba mañana.
- **Retirar un acceso es inmediato y total.** Deshabilitar a un cuidador le
  quita medicamentos, dosis, inventario, invitaciones y vistas de una vez.
- **La clave pública deja de ser un problema.** Que esté en el bundle es
  irrelevante cuando no autoriza nada por sí sola.
- **Es verificable.** Las pruebas comprueban que un usuario ajeno recibe cero
  filas, y el healthcheck público lo sondea de forma continua: si una petición
  sin sesión recibiera datos, lo reporta como degradado.

### Negativas — lo que cedimos

- **Depurar es más difícil.** Un fallo de permisos no da error: devuelve una
  lista vacía. Distinguir «no hay datos» de «no tienes derecho a verlos» exige
  conocer las políticas.
- **Las políticas son invisibles desde el código de la aplicación.** Quien lea
  la app no ve por qué una consulta devuelve menos de lo que pidió.
- **Los errores son silenciosos y graves.** Una política mal escrita no rompe
  nada de forma visible: simplemente expone o esconde datos. Por eso las
  pruebas de aislamiento se validan a propósito desactivando la regla y
  comprobando que fallan.
- **Riesgo de recursión.** Una política sobre la tabla de miembros que consulte
  esa misma tabla entra en bucle infinito. Se resuelve con una función que se
  ejecuta con permisos elevados, lo cual hay que entender antes de tocarla.
- **Atarse al motor.** Estas reglas son de PostgreSQL. Migrar a otra base
  obligaría a reimplementar la autorización entera.
- **Añadir un rol puede abrir un agujero.** Al introducir el rol de
  administrador, la política de invitaciones permitía a cualquier miembro
  emitir códigos de administrador — una escalada de privilegios que solo se
  cerró al restringir esa política.

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Filtrar en el cliente | No protege nada: la clave de la API viaja en el paquete de la app |
| Servidor propio como intermediario | Funciona, pero añade un componente que desplegar, mantener y que puede caerse, para un sistema de dos familias |
| Una base de datos por familia | Aislamiento perfecto y coste operativo desproporcionado |

---

## Relación con otras decisiones

Esta decisión es consecuencia directa de [ADR-001](ADR-001-offline-first-con-cola-de-salida.md).
Al no haber servidor propio, la base de datos es el único lugar donde una regla
de acceso puede ser inevitable.

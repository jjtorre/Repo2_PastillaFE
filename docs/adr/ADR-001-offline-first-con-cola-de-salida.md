# ADR-001: Arquitectura offline-first con cola de salida en el dispositivo

- **Estado:** Aceptada
- **Fecha:** 2026-09-22
- **Decisores:** equipo de desarrollo, validado con el cliente (Ozman Carias)

---

## Contexto

El sistema tiene dos usuarios con necesidades opuestas.

El **paciente** es una persona mayor que vive sola — en este proyecto, la
suegra y la abuela del cliente. Usa la app varias veces al día para marcar que
tomó una pastilla. Su conexión no está garantizada: puede estar sin datos
móviles, con señal intermitente o con el WiFi caído.

El **cuidador** consulta desde un navegador, casi siempre con buena conexión, y
solo necesita leer.

La pregunta que había que resolver es qué ocurre cuando el paciente marca una
dosis y no hay red.

Un diseño convencional cliente-servidor haría que la app escribiera
directamente contra la base de datos y mostrara un error si falla. Aplicado a
este caso, el resultado sería:

1. El paciente se toma la pastilla.
2. Toca el círculo para marcarla.
3. La app muestra un error porque no hay conexión.
4. La toma **no queda registrada**.

Y a partir de ahí el daño se propaga. El cuidador ve «no tomado» y llama
alarmado. O peor: el paciente, al ver que la app sigue marcándola como
pendiente, vuelve a tomarse la dosis.

Una app de medicación que solo funciona con internet falla exactamente cuando
más importa que no falle. El dato que el sistema existe para capturar es
precisamente el que se pierde.

---

## Decisión

Adoptamos una Arquitectura offline-first con cola de salida en el dispositivo.

El teléfono es la fuente de verdad inmediata. Cada escritura hace dos cosas, en
este orden:

1. Se aplica en el almacenamiento local, y la interfaz responde al instante.
2. Se encola como operación pendiente en una cola persistente (patrón
   *outbox*), que sobrevive al cierre de la app.

Un proceso de fondo drena la cola cuando hay conexión. **La interfaz nunca
espera a la red**, ni siquiera para mostrar un indicador de carga.

Esto obliga a cuatro decisiones derivadas, que no son opcionales:

- **Los identificadores se generan en el dispositivo** (UUID). Una fila creada
  sin conexión conserva su identidad al subir, y dos teléfonos no colisionan.
- **Las escrituras son idempotentes.** Un índice único parcial sobre las dosis
  vigentes hace que un reintento por mala cobertura no descuente inventario dos
  veces.
- **Nada se borra de verdad.** Un borrado deja lápida (`deleted_at`), porque sin
  ella el otro dispositivo resucitaría el registro en su siguiente subida.
- **Se sube antes de bajar**, y la bajada solo se aplica si la cola quedó
  vacía. Al revés, el servidor pisaría cambios locales que aún no han viajado.

---

## Consecuencias

### Positivas

- **La app funciona entera sin internet.** Registrar, marcar y consultar no
  dependen de la red en ningún punto.
- **La interfaz es inmediata.** No hay estados de carga ni de error en el
  camino crítico, lo cual importa especialmente con usuarios mayores, para
  quienes un mensaje de error inesperado es motivo de abandono.
- **La mala cobertura deja de ser un caso de fallo** y pasa a ser un caso
  normal: la operación simplemente espera en la cola.
- **El servidor es reemplazable.** La app no depende de que exista.

### Negativas — lo que cedimos

- **Consistencia inmediata.** El cuidador puede ver información desfasada. Hay
  una ventana en la que el teléfono sabe algo que el panel todavía no.
- **Validación tardía.** El dispositivo acepta escrituras que el servidor podría
  rechazar. Los errores aparecen al sincronizar, no al escribir.
- **Resolución de conflictos simplista.** Gana el último en llegar al servidor.
  Dos ediciones simultáneas del mismo medicamento desde dos dispositivos pierden
  una, en silencio.
- **Complejidad real y concentrada.** La cola, el remapeo de identificadores,
  las lápidas y la idempotencia son piezas que hay que mantener correctas.
  **Todos los errores serios encontrados en el proyecto salieron de aquí**: una
  dosis marcada antes de la migración de identificadores dejaba la cola
  atascada de forma permanente, y marcar una dosis llegó a descontar inventario
  dos veces.
- **La cola crece sin límite** mientras no haya red. Se mitiga colapsando
  operaciones redundantes sobre el mismo objetivo, pero el riesgo existe.

### Mitigaciones adoptadas

- Operaciones redundantes colapsadas al encolar.
- El envío se detiene en el primer fallo, para no romper el orden causal.
- Pruebas automatizadas sobre la cola, la migración de identificadores y el
  orden de sincronización, precisamente porque son la parte frágil.

---

## Alternativas consideradas

| Alternativa | Por qué se descartó |
|---|---|
| Cliente-servidor directo | Pierde el registro de la dosis justo cuando no hay red, que es el escenario que el sistema debe soportar |
| Caché de solo lectura | Permitiría consultar sin red, pero no marcar una dosis, que es la acción principal |
| Base de datos con replicación integrada | Resuelve el problema, pero ata el proyecto a un proveedor concreto y excede lo razonable para dos familiares |

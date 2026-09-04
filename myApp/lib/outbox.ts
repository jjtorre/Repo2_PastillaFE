// lib/outbox.ts
// Cola de operaciones pendientes de subir (patron outbox).
//
// Toda escritura se aplica PRIMERO en local y ademas se encola aqui. Cuando
// hay red, la cola se drena en orden. Si no hay red, se queda esperando: la
// app no se bloquea ni pierde nada.
//
// Vive en AsyncStorage, asi que sobrevive a cerrar la app.

import AsyncStorage from '@react-native-async-storage/async-storage';

const OUTBOX_KEY = '@myApp/outbox';

export type OutboxOp =
  // Alta o edicion de la definicion del medicamento.
  | { kind: 'upsert'; medicationId: string }
  // Borrado suave: en el servidor es un UPDATE de deleted_at, no un DELETE.
  | { kind: 'delete'; medicationId: string }
  // Marcar/desmarcar una dosis. Lleva la fecha LOCAL del dia de la dosis,
  // porque si se encolo sin conexion puede subirse dias despues y el servidor
  // no tiene forma de adivinar a que dia pertenecia.
  | { kind: 'dose'; medicationId: string; scheduledFor: string; taken: boolean };

export async function readOutbox(): Promise<OutboxOp[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxOp[]) : [];
  } catch {
    return [];
  }
}

export async function writeOutbox(ops: OutboxOp[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
  } catch (e) {
    console.error('Error guardando la cola de sincronizacion:', e);
  }
}

export async function enqueue(op: OutboxOp): Promise<void> {
  const ops = await readOutbox();

  // Se colapsan las operaciones redundantes sobre el mismo objetivo: subir
  // tres ediciones seguidas del mismo medicamento no aporta nada, solo la
  // ultima cuenta. Sin esto la cola crece sin limite mientras no haya red.
  const filtered = ops.filter((existing) => {
    if (op.kind === 'upsert' || op.kind === 'delete') {
      return !(
        (existing.kind === 'upsert' || existing.kind === 'delete') &&
        existing.medicationId === op.medicationId
      );
    }
    return !(
      existing.kind === 'dose' &&
      existing.medicationId === op.medicationId &&
      existing.scheduledFor === op.scheduledFor
    );
  });

  await writeOutbox([...filtered, op]);
}

export async function outboxSize(): Promise<number> {
  return (await readOutbox()).length;
}

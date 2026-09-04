// lib/migrate.ts
// Migracion de una sola vez de los datos que ya viven en el telefono.
//
// Hace falta porque los id antiguos se generaban con Date.now().toString()
// ([storage.ts] antes de esta migracion). Eso no es un UUID, la columna del
// servidor lo rechazaria, y ademas dos telefonos creando un medicamento en el
// mismo milisegundo generarian el MISMO id.

import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readLocal, writeLocal } from './local';
import { enqueue, readOutbox, writeOutbox } from './outbox';
import { localToday } from './status';

const MIGRATED_KEY = '@myApp/migratedToSupabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bootstrapLocalData(): Promise<void> {
  if (await AsyncStorage.getItem(MIGRATED_KEY)) return;

  const current = await readLocal();

  const idMap = new Map<string, string>();
  const remapped = current.map((med) => {
    if (UUID_RE.test(med.id)) return med;
    const nuevoId = Crypto.randomUUID();
    idMap.set(med.id, nuevoId);
    return { ...med, id: nuevoId };
  });

  await writeLocal(remapped);

  // La cola puede traer operaciones encoladas ANTES de esta migracion (por
  // ejemplo una dosis marcada mientras la app corria en modo local, sin
  // credenciales). Apuntan al id viejo, y si no se reescriben quedarian
  // huerfanas: fallarian siempre y, como el push se detiene en el primer
  // fallo, atascarian la cola entera.
  if (idMap.size > 0) {
    const ops = await readOutbox();
    await writeOutbox(
      ops.map((op) => {
        const nuevoId = idMap.get(op.medicationId);
        return nuevoId ? { ...op, medicationId: nuevoId } : op;
      })
    );
  }

  // Todo lo que ya existia en el telefono esta, por definicion, sin subir.
  for (const med of remapped) {
    await enqueue({ kind: 'upsert', medicationId: med.id });

    // Si una dosis de hoy ya estaba marcada, se conserva como evento para no
    // perderla y para que el inventario del servidor cuadre con el local.
    if (med.status === 'taken' && med.lastTakenAt) {
      await enqueue({
        kind: 'dose',
        medicationId: med.id,
        scheduledFor: localToday(),
        taken: true,
      });
    }
  }

  await AsyncStorage.setItem(MIGRATED_KEY, new Date().toISOString());
}

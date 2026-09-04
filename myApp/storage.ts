// storage.ts
// API publica de persistencia. Las firmas son EXACTAMENTE las de antes, asi
// que las cuatro pantallas no cambiaron ni una linea.
//
// Lo que cambio por dentro: cada escritura se aplica primero en el telefono
// (AsyncStorage, igual que siempre) y ademas se encola en el outbox para
// subirla a Supabase cuando haya red. La app sigue funcionando entera sin
// internet; sincronizar es un efecto de fondo, nunca algo que la UI espera.

import * as Crypto from 'expo-crypto';
import type { Medication, NewMedicationInput } from './types';
import { readLocal, writeLocal } from './lib/local';
import { enqueue } from './lib/outbox';
import { syncNow } from './lib/sync';
import { localToday } from './lib/status';

// computeStatus se movio a lib/status.ts para romper un ciclo de imports.
// Se reexporta para que `import { computeStatus } from '../storage'` siga
// funcionando en MedicationListScreen y CaregiverViewScreen.
export { computeStatus } from './lib/status';
export { syncNow } from './lib/sync';

// Campos que describen QUE es el medicamento. Cambiarlos es una edicion y se
// sube como upsert; marcar una dosis no pasa por aqui (ver updateMedication).
const DEFINITION_FIELDS: (keyof Medication)[] = [
  'name',
  'time',
  'expirationDate',
  'quantity',
];

export async function getMedications(): Promise<Medication[]> {
  return readLocal();
}

export async function saveMedications(medications: Medication[]): Promise<boolean> {
  return writeLocal(medications);
}

export async function addMedication(medication: NewMedicationInput): Promise<Medication> {
  const current = await readLocal();
  const newMedication: Medication = {
    // UUID en vez de Date.now(): un medicamento creado sin conexion conserva
    // su identidad al subir, y dos telefonos no pueden colisionar.
    id: Crypto.randomUUID(),
    status: 'pending',
    lastTakenAt: null,
    ...medication,
  };
  const updated = [...current, newMedication];
  await writeLocal(updated);

  await enqueue({ kind: 'upsert', medicationId: newMedication.id });
  void syncNow();

  return newMedication;
}

export async function updateMedication(
  id: string,
  changes: Partial<Medication>
): Promise<Medication | undefined> {
  const current = await readLocal();
  const before = current.find((med) => med.id === id);
  const updated = current.map((med) => (med.id === id ? { ...med, ...changes } : med));
  await writeLocal(updated);

  const after = updated.find((med) => med.id === id);
  if (!before || !after) return after;

  const statusChanged = changes.status !== undefined && changes.status !== before.status;

  if (statusChanged) {
    // Marcar o desmarcar una dosis viaja como EVENTO, no como campos sueltos.
    //
    // Y a proposito no se encola tambien un upsert: record_dose() ya descuenta
    // el inventario en el servidor. Subir ademas el quantity que la pantalla
    // acaba de decrementar en local lo restaria dos veces.
    await enqueue({
      kind: 'dose',
      medicationId: id,
      scheduledFor: localToday(),
      taken: changes.status === 'taken',
    });
  } else if (DEFINITION_FIELDS.some((field) => changes[field] !== undefined)) {
    await enqueue({ kind: 'upsert', medicationId: id });
  }

  void syncNow();
  return after;
}

export async function deleteMedication(id: string): Promise<void> {
  const current = await readLocal();
  await writeLocal(current.filter((med) => med.id !== id));

  // En el servidor esto es un borrado suave (deleted_at). Sin lapida, el otro
  // telefono volveria a subir el medicamento en su siguiente sincronizacion.
  await enqueue({ kind: 'delete', medicationId: id });
  void syncNow();
}

export async function getMedicationById(id: string): Promise<Medication | null> {
  const current = await readLocal();
  return current.find((med) => med.id === id) ?? null;
}

// storage.ts
// Toda la persistencia de la app vive aquí, en el teléfono, usando
// AsyncStorage. No hay backend ni login: la app asume un solo teléfono
// compartido por la familia (decisión validada con el PO).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Medication, NewMedicationInput } from './types';

const MEDICATIONS_KEY = '@myApp/medications';

export async function getMedications(): Promise<Medication[]> {
  try {
    const raw = await AsyncStorage.getItem(MEDICATIONS_KEY);
    return raw ? (JSON.parse(raw) as Medication[]) : [];
  } catch (e) {
    console.error('Error leyendo medicamentos:', e);
    return [];
  }
}

export async function saveMedications(medications: Medication[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
    return true;
  } catch (e) {
    console.error('Error guardando medicamentos:', e);
    return false;
  }
}

export async function addMedication(medication: NewMedicationInput): Promise<Medication> {
  const current = await getMedications();
  const newMedication: Medication = {
    id: Date.now().toString(),
    status: 'pending',
    lastTakenAt: null,
    ...medication,
  };
  const updated = [...current, newMedication];
  await saveMedications(updated);
  return newMedication;
}

export async function updateMedication(
  id: string,
  changes: Partial<Medication>
): Promise<Medication | undefined> {
  const current = await getMedications();
  const updated = current.map((med) => (med.id === id ? { ...med, ...changes } : med));
  await saveMedications(updated);
  return updated.find((med) => med.id === id);
}

export async function deleteMedication(id: string): Promise<void> {
  const current = await getMedications();
  const updated = current.filter((med) => med.id !== id);
  await saveMedications(updated);
}

export async function getMedicationById(id: string): Promise<Medication | null> {
  const current = await getMedications();
  return current.find((med) => med.id === id) ?? null;
}

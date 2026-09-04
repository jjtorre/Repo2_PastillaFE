// lib/local.ts
// Dueno unico de la clave de AsyncStorage donde vive la copia local.
//
// Existe como modulo aparte para que storage.ts (API publica) y sync.ts
// (motor de sincronizacion) puedan leer y escribir los mismos datos sin
// importarse mutuamente.
//
// La copia local sigue siendo la fuente de verdad INMEDIATA: la app funciona
// entera sin internet y jamas espera a la red para pintar.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Medication } from '../types';

const MEDICATIONS_KEY = '@myApp/medications';
const HOUSEHOLD_KEY = '@myApp/householdId';

export async function readLocal(): Promise<Medication[]> {
  try {
    const raw = await AsyncStorage.getItem(MEDICATIONS_KEY);
    return raw ? (JSON.parse(raw) as Medication[]) : [];
  } catch (e) {
    console.error('Error leyendo medicamentos:', e);
    return [];
  }
}

export async function writeLocal(medications: Medication[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
    return true;
  } catch (e) {
    console.error('Error guardando medicamentos:', e);
    return false;
  }
}

export async function getHouseholdId(): Promise<string | null> {
  return AsyncStorage.getItem(HOUSEHOLD_KEY);
}

export async function setHouseholdId(id: string): Promise<void> {
  await AsyncStorage.setItem(HOUSEHOLD_KEY, id);
}

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import AsyncStorage, { __reset } from '@react-native-async-storage/async-storage';
import { readLocal, writeLocal, getHouseholdId, setHouseholdId } from '../myApp/lib/local';
import type { Medication } from '../myApp/types';

const MED: Medication = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: 'Losartan',
  time: '05:01',
  expirationDate: '2030-01-01T00:00:00.000Z',
  quantity: 12,
  status: 'pending',
  lastTakenAt: null,
};

beforeEach(() => {
  __reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('copia local', () => {
  it('devuelve una lista vacia cuando no hay nada guardado', async () => {
    expect(await readLocal()).toEqual([]);
  });

  it('guarda y recupera medicamentos', async () => {
    expect(await writeLocal([MED])).toBe(true);
    expect(await readLocal()).toEqual([MED]);
  });

  // La app nunca debe quedarse en blanco por un dato corrupto: es preferible
  // una lista vacia a una pantalla rota.
  it('devuelve lista vacia si el contenido no es JSON valido', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await AsyncStorage.setItem('@myApp/medications', '{roto');

    expect(await readLocal()).toEqual([]);
  });

  it('devuelve false si el guardado falla', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disco lleno'));

    expect(await writeLocal([MED])).toBe(false);
  });
});

describe('identificador del hogar', () => {
  it('es nulo antes de la primera sincronizacion', async () => {
    expect(await getHouseholdId()).toBeNull();
  });

  it('se conserva una vez asignado', async () => {
    await setHouseholdId('hogar-1');
    expect(await getHouseholdId()).toBe('hogar-1');
  });

  it('se puede reasignar', async () => {
    await setHouseholdId('hogar-1');
    await setHouseholdId('hogar-2');
    expect(await getHouseholdId()).toBe('hogar-2');
  });
});

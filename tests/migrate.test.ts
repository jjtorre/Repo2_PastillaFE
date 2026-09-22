import { describe, it, expect, beforeEach } from 'vitest';
import AsyncStorage, { __reset } from '@react-native-async-storage/async-storage';
import { bootstrapLocalData } from '../myApp/lib/migrate';
import { readLocal, writeLocal } from '../myApp/lib/local';
import { readOutbox, enqueue } from '../myApp/lib/outbox';
import type { Medication } from '../myApp/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function legado(parcial: Partial<Medication> = {}): Medication {
  return {
    // Identificador del modelo viejo: Date.now().toString().
    id: '1758300000000',
    name: 'Losartan',
    time: '05:01',
    expirationDate: '2030-01-01T00:00:00.000Z',
    quantity: 12,
    status: 'pending',
    lastTakenAt: null,
    ...parcial,
  };
}

beforeEach(() => {
  __reset();
});

describe('migracion de datos ya existentes en el telefono', () => {
  it('reasigna los identificadores antiguos a UUID', async () => {
    await writeLocal([legado()]);
    await bootstrapLocalData();

    const [med] = await readLocal();
    expect(med.id).toMatch(UUID_RE);
    expect(med.id).not.toBe('1758300000000');
  });

  it('conserva el resto de los campos intactos', async () => {
    await writeLocal([legado({ name: 'Acetaminofen', quantity: 7 })]);
    await bootstrapLocalData();

    const [med] = await readLocal();
    expect(med).toMatchObject({ name: 'Acetaminofen', quantity: 7, time: '05:01' });
  });

  it('no toca los identificadores que ya son UUID', async () => {
    const yaValido = 'aaaaaaaa-0000-0000-0000-000000000001';
    await writeLocal([legado({ id: yaValido })]);
    await bootstrapLocalData();

    const [med] = await readLocal();
    expect(med.id).toBe(yaValido);
  });

  it('encola la subida de todo lo que ya existia', async () => {
    await writeLocal([legado({ id: '1' }), legado({ id: '2' })]);
    await bootstrapLocalData();

    const ops = await readOutbox();
    expect(ops.filter((o) => o.kind === 'upsert')).toHaveLength(2);
  });

  it('preserva como evento una dosis de hoy ya marcada', async () => {
    await writeLocal([
      legado({ status: 'taken', lastTakenAt: new Date().toISOString() }),
    ]);
    await bootstrapLocalData();

    const ops = await readOutbox();
    const dosis = ops.filter((o) => o.kind === 'dose');
    expect(dosis).toHaveLength(1);
    expect(dosis[0]).toMatchObject({ taken: true });
  });

  // El bug que aparecio al ejecutar la app: una dosis marcada ANTES de que
  // corriera la migracion quedaba apuntando al identificador viejo. Al
  // reasignarlo, esa operacion referenciaba un medicamento inexistente,
  // fallaba siempre, y como el envio se detiene en el primer fallo, atascaba
  // la cola entera de forma permanente.
  it('reescribe las operaciones ya encoladas que apuntan al id viejo', async () => {
    await writeLocal([legado({ id: '1758300000000' })]);
    await enqueue({
      kind: 'dose',
      medicationId: '1758300000000',
      scheduledFor: '2026-01-15',
      taken: true,
    });

    await bootstrapLocalData();

    const [med] = await readLocal();
    const ops = await readOutbox();
    const huerfanas = ops.filter((o) => o.medicationId === '1758300000000');

    expect(huerfanas).toHaveLength(0);
    expect(ops.every((o) => o.medicationId === med.id)).toBe(true);
  });

  it('solo se ejecuta una vez', async () => {
    await writeLocal([legado()]);
    await bootstrapLocalData();

    const primerId = (await readLocal())[0].id;
    const opsTrasPrimera = (await readOutbox()).length;

    await bootstrapLocalData();
    await bootstrapLocalData();

    expect((await readLocal())[0].id).toBe(primerId);
    expect(await readOutbox()).toHaveLength(opsTrasPrimera);
  });

  it('deja marca de que ya corrio', async () => {
    await writeLocal([legado()]);
    await bootstrapLocalData();

    expect(await AsyncStorage.getItem('@myApp/migratedToSupabase')).not.toBeNull();
  });

  it('no falla si no habia nada guardado', async () => {
    await expect(bootstrapLocalData()).resolves.toBeUndefined();
    expect(await readLocal()).toEqual([]);
  });
});

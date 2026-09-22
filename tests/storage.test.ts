import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __reset } from '@react-native-async-storage/async-storage';

// storage.ts dispara una sincronizacion en cada escritura. Aqui se anula: lo
// que se prueba es que deje la copia local y la cola en el estado correcto,
// no que hable con la red.
vi.mock('../myApp/lib/sync', () => ({
  syncNow: vi.fn(async () => 'sin-configurar' as const),
  startBackgroundSync: vi.fn(() => () => {}),
}));

const {
  addMedication,
  updateMedication,
  deleteMedication,
  getMedicationById,
  getMedications,
  saveMedications,
} = await import('../myApp/storage');
const { readOutbox } = await import('../myApp/lib/outbox');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NUEVO = {
  name: 'Paracetamol',
  time: '08:00',
  expirationDate: '2030-01-01T00:00:00.000Z',
  quantity: 30,
};

beforeEach(() => {
  __reset();
});

describe('alta de medicamentos', () => {
  it('genera un UUID en vez de una marca de tiempo', async () => {
    const med = await addMedication(NUEVO);
    expect(med.id).toMatch(UUID_RE);
  });

  // Date.now() daba el mismo valor a dos altas en el mismo milisegundo, y con
  // varios telefonos eso son dos medicamentos distintos con el mismo id.
  it('no repite identificadores en altas consecutivas', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++) {
      ids.add((await addMedication(NUEVO)).id);
    }
    expect(ids.size).toBe(25);
  });

  it('nace pendiente y sin ninguna toma', async () => {
    const med = await addMedication(NUEVO);
    expect(med.status).toBe('pending');
    expect(med.lastTakenAt).toBeNull();
  });

  it('encola su subida', async () => {
    const med = await addMedication(NUEVO);
    const ops = await readOutbox();
    expect(ops).toEqual([{ kind: 'upsert', medicationId: med.id }]);
  });

  it('lo deja disponible en la lista y por identificador', async () => {
    const med = await addMedication(NUEVO);
    expect(await getMedications()).toHaveLength(1);
    expect(await getMedicationById(med.id)).toMatchObject({ name: 'Paracetamol' });
  });

  it('devuelve null al buscar un identificador que no existe', async () => {
    expect(await getMedicationById('no-existe')).toBeNull();
  });
});

describe('edicion frente a marcado de dosis', () => {
  it('editar un campo de definicion encola un upsert', async () => {
    const med = await addMedication(NUEVO);
    await updateMedication(med.id, { name: 'Paracetamol 500mg' });

    const ops = await readOutbox();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ kind: 'upsert', medicationId: med.id });
  });

  it('marcar una dosis encola un evento, no un upsert', async () => {
    const med = await addMedication(NUEVO);
    await updateMedication(med.id, {
      status: 'taken',
      lastTakenAt: new Date().toISOString(),
      quantity: 29,
    });

    const ops = await readOutbox();
    const dosis = ops.filter((o) => o.kind === 'dose');
    expect(dosis).toHaveLength(1);
    expect(dosis[0]).toMatchObject({ taken: true });
  });

  // El doble descuento: record_dose() ya resta la pastilla en el servidor.
  // Si ademas subieramos el quantity que la pantalla acaba de decrementar en
  // local, el inventario bajaria de dos en dos por cada toma.
  it('marcar una dosis NO encola tambien el inventario', async () => {
    const med = await addMedication(NUEVO);
    await updateMedication(med.id, {
      status: 'taken',
      lastTakenAt: new Date().toISOString(),
      quantity: 29,
    });

    const ops = await readOutbox();
    const upserts = ops.filter((o) => o.kind === 'upsert' && o.medicationId === med.id);
    // Solo queda el del alta; la toma no anadio ninguno.
    expect(upserts).toHaveLength(1);
  });

  it('desmarcar encola el evento contrario', async () => {
    const med = await addMedication(NUEVO);
    await updateMedication(med.id, { status: 'taken', lastTakenAt: new Date().toISOString() });
    await updateMedication(med.id, { status: 'pending', lastTakenAt: null });

    const ops = await readOutbox();
    const dosis = ops.filter((o) => o.kind === 'dose');
    expect(dosis).toHaveLength(1);
    expect(dosis[0]).toMatchObject({ taken: false });
  });

  it('un cambio que no altera el estado no cuenta como dosis', async () => {
    const med = await addMedication(NUEVO);
    await updateMedication(med.id, { status: 'pending' });

    const ops = await readOutbox();
    expect(ops.filter((o) => o.kind === 'dose')).toHaveLength(0);
  });

  it('aplica los cambios sobre la copia local', async () => {
    const med = await addMedication(NUEVO);
    await updateMedication(med.id, { name: 'Otro nombre', quantity: 5 });

    expect(await getMedicationById(med.id)).toMatchObject({
      name: 'Otro nombre',
      quantity: 5,
    });
  });

  it('devuelve undefined al editar algo inexistente', async () => {
    expect(await updateMedication('no-existe', { name: 'x' })).toBeUndefined();
  });
});

describe('borrado', () => {
  it('lo quita de la copia local', async () => {
    const med = await addMedication(NUEVO);
    await deleteMedication(med.id);

    expect(await getMedications()).toHaveLength(0);
  });

  // Sin lapida en el servidor, el otro telefono volveria a subirlo en su
  // siguiente sincronizacion y el medicamento resucitaria.
  it('encola un borrado para que deje lapida en el servidor', async () => {
    const med = await addMedication(NUEVO);
    await deleteMedication(med.id);

    const ops = await readOutbox();
    expect(ops).toEqual([{ kind: 'delete', medicationId: med.id }]);
  });

  it('no afecta a los demas medicamentos', async () => {
    const a = await addMedication(NUEVO);
    await addMedication({ ...NUEVO, name: 'Otro' });
    await deleteMedication(a.id);

    const quedan = await getMedications();
    expect(quedan).toHaveLength(1);
    expect(quedan[0].name).toBe('Otro');
  });
});

describe('saveMedications', () => {
  it('reemplaza la lista completa', async () => {
    await addMedication(NUEVO);
    expect(await saveMedications([])).toBe(true);
    expect(await getMedications()).toEqual([]);
  });
});

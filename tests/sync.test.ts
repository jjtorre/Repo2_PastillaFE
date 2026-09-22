import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __reset } from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Dobles de todo lo que sale del telefono. Lo que se prueba es el ORDEN y las
// decisiones de sincronizacion, no la red.
// ---------------------------------------------------------------------------

// NetInfo y react-native estan aliasados a dobles en vitest.config, no
// mockeados aqui: solo existen bajo myApp/node_modules, y un vi.mock escrito
// en la raiz no llega a resolverlos.
import { __net as net } from '@react-native-community/netinfo';

const llamadas: string[] = [];
let filasMedicamentos: unknown[] = [];
let filasEventos: unknown[] = [];
let errorUpsert: { message: string } | null = null;
let errorRpc: { message: string } | null = null;

function constructorConsulta(tabla: string) {
  const encadenable: any = {
    select: () => encadenable,
    eq: () => encadenable,
    is: () => encadenable,
    then: undefined,
  };
  // Las consultas de lectura se resuelven como promesa al esperarlas.
  encadenable.then = (resolver: (v: unknown) => void) => {
    llamadas.push(`select:${tabla}`);
    const data = tabla === 'medications' ? filasMedicamentos : filasEventos;
    return Promise.resolve({ data, error: null }).then(resolver);
  };
  encadenable.upsert = async () => {
    llamadas.push(`upsert:${tabla}`);
    return { error: errorUpsert };
  };
  encadenable.update = () => ({
    eq: async () => {
      llamadas.push(`update:${tabla}`);
      return { error: null };
    },
  });
  return encadenable;
}

vi.mock('../myApp/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (tabla: string) => constructorConsulta(tabla),
    rpc: async (fn: string) => {
      llamadas.push(`rpc:${fn}`);
      return { error: errorRpc };
    },
  },
}));

vi.mock('../myApp/lib/session', () => ({
  ensureSession: vi.fn(async () => 'usuario-1'),
  ensureHousehold: vi.fn(async () => 'hogar-1'),
}));

const { syncNow } = await import('../myApp/lib/sync');
const { enqueue, readOutbox } = await import('../myApp/lib/outbox');
const { readLocal, writeLocal } = await import('../myApp/lib/local');

const MED_A = 'aaaaaaaa-0000-0000-0000-000000000001';

beforeEach(async () => {
  __reset();
  llamadas.length = 0;
  filasMedicamentos = [];
  filasEventos = [];
  errorUpsert = null;
  errorRpc = null;
  net.isConnected = true;
  // La migracion inicial se da por hecha para que no interfiera.
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem('@myApp/migratedToSupabase', new Date().toISOString());
});

describe('condiciones previas', () => {
  it('no hace nada sin conexion', async () => {
    net.isConnected = false;
    expect(await syncNow()).toBe('sin-red');
    expect(llamadas).toHaveLength(0);
  });
});

describe('orden de sincronizacion', () => {
  // Al reves, el servidor pisaria cambios locales que aun no han subido.
  it('sube antes de bajar', async () => {
    await writeLocal([
      {
        id: MED_A,
        name: 'Paracetamol',
        time: '08:00',
        expirationDate: '2030-01-01T00:00:00.000Z',
        quantity: 30,
        status: 'pending',
        lastTakenAt: null,
      },
    ]);
    await enqueue({ kind: 'upsert', medicationId: MED_A });

    expect(await syncNow()).toBe('ok');

    const posUpsert = llamadas.indexOf('upsert:medications');
    const posSelect = llamadas.indexOf('select:medications');
    expect(posUpsert).toBeGreaterThanOrEqual(0);
    expect(posUpsert).toBeLessThan(posSelect);
  });

  // Con operaciones pendientes el servidor esta desactualizado por
  // definicion: aplicar su version haria parpadear los datos hacia atras.
  it('no aplica la bajada si quedo algo sin subir', async () => {
    errorUpsert = { message: 'fallo de red' };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await writeLocal([
      {
        id: MED_A,
        name: 'Paracetamol',
        time: '08:00',
        expirationDate: '2030-01-01T00:00:00.000Z',
        quantity: 30,
        status: 'pending',
        lastTakenAt: null,
      },
    ]);
    await enqueue({ kind: 'upsert', medicationId: MED_A });

    expect(await syncNow()).toBe('pendiente');
    expect(llamadas).not.toContain('select:medications');
  });

  it('conserva en la cola lo que no pudo subir', async () => {
    errorUpsert = { message: 'fallo de red' };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await writeLocal([
      {
        id: MED_A,
        name: 'Paracetamol',
        time: '08:00',
        expirationDate: '2030-01-01T00:00:00.000Z',
        quantity: 30,
        status: 'pending',
        lastTakenAt: null,
      },
    ]);
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await syncNow();

    expect(await readOutbox()).toHaveLength(1);
  });

  it('vacia la cola cuando todo sube bien', async () => {
    await writeLocal([
      {
        id: MED_A,
        name: 'Paracetamol',
        time: '08:00',
        expirationDate: '2030-01-01T00:00:00.000Z',
        quantity: 30,
        status: 'pending',
        lastTakenAt: null,
      },
    ]);
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await syncNow();

    expect(await readOutbox()).toHaveLength(0);
  });
});

describe('traduccion de cada operacion', () => {
  it('una dosis viaja por RPC, no como actualizacion de inventario', async () => {
    await enqueue({ kind: 'dose', medicationId: MED_A, scheduledFor: '2026-01-15', taken: true });
    await syncNow();

    expect(llamadas).toContain('rpc:record_dose');
    expect(llamadas).not.toContain('upsert:medications');
  });

  it('desmarcar usa la funcion contraria', async () => {
    await enqueue({ kind: 'dose', medicationId: MED_A, scheduledFor: '2026-01-15', taken: false });
    await syncNow();

    expect(llamadas).toContain('rpc:undo_dose');
  });

  it('el borrado se traduce en una actualizacion, no en un delete', async () => {
    await enqueue({ kind: 'delete', medicationId: MED_A });
    await syncNow();

    expect(llamadas).toContain('update:medications');
  });

  it('omite el upsert de un medicamento que ya no esta en local', async () => {
    await enqueue({ kind: 'upsert', medicationId: 'ya-borrado' });
    expect(await syncNow()).toBe('ok');

    expect(llamadas).not.toContain('upsert:medications');
    expect(await readOutbox()).toHaveLength(0);
  });
});

describe('bajada de datos', () => {
  it('reconstruye la copia local desde el servidor', async () => {
    filasMedicamentos = [
      {
        id: MED_A,
        name: 'Losartan',
        scheduled_time: '05:01:00',
        expiration_date: '2030-06-15',
        quantity: 12,
      },
    ];

    expect(await syncNow()).toBe('ok');

    const local = await readLocal();
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({ id: MED_A, name: 'Losartan', quantity: 12 });
  });

  it('recorta los segundos de la hora programada', async () => {
    filasMedicamentos = [
      {
        id: MED_A,
        name: 'Losartan',
        scheduled_time: '05:01:00',
        expiration_date: '2030-06-15',
        quantity: 12,
      },
    ];
    await syncNow();

    expect((await readLocal())[0].time).toBe('05:01');
  });

  // La fecha llega como 'YYYY-MM-DD' y se interpreta a medianoche LOCAL. Si
  // se tratara como UTC, la pantalla de detalle mostraria el dia anterior.
  it('interpreta la caducidad en hora local', async () => {
    filasMedicamentos = [
      {
        id: MED_A,
        name: 'Losartan',
        scheduled_time: '05:01:00',
        expiration_date: '2030-06-15',
        quantity: 12,
      },
    ];
    await syncNow();

    const guardada = new Date((await readLocal())[0].expirationDate);
    expect(guardada.getFullYear()).toBe(2030);
    expect(guardada.getMonth()).toBe(5);
    expect(guardada.getDate()).toBe(15);
  });

  it('marca como tomado lo que tiene evento vigente hoy', async () => {
    filasMedicamentos = [
      {
        id: MED_A,
        name: 'Losartan',
        scheduled_time: '05:01:00',
        expiration_date: '2030-06-15',
        quantity: 12,
      },
    ];
    filasEventos = [{ medication_id: MED_A, taken_at: new Date().toISOString() }];

    await syncNow();

    expect((await readLocal())[0].status).toBe('taken');
  });
});

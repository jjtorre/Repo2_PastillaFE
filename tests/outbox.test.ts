import { describe, it, expect, beforeEach } from 'vitest';
import { __reset } from '@react-native-async-storage/async-storage';
import {
  readOutbox,
  writeOutbox,
  enqueue,
  outboxSize,
  type OutboxOp,
} from '../myApp/lib/outbox';

beforeEach(() => {
  __reset();
});

const MED_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const MED_B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('cola de operaciones pendientes', () => {
  it('empieza vacia', async () => {
    expect(await readOutbox()).toEqual([]);
    expect(await outboxSize()).toBe(0);
  });

  it('conserva el orden de encolado', async () => {
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await enqueue({ kind: 'upsert', medicationId: MED_B });

    const ops = await readOutbox();
    expect(ops.map((o) => o.medicationId)).toEqual([MED_A, MED_B]);
  });

  // Sin esto la cola crece sin limite mientras no hay red: editar un
  // medicamento diez veces sin conexion dejaria diez subidas identicas.
  it('colapsa varios upsert del mismo medicamento en uno', async () => {
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await enqueue({ kind: 'upsert', medicationId: MED_A });

    expect(await outboxSize()).toBe(1);
  });

  it('un borrado sustituye al upsert pendiente del mismo medicamento', async () => {
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await enqueue({ kind: 'delete', medicationId: MED_A });

    const ops = await readOutbox();
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('delete');
  });

  it('no mezcla medicamentos distintos al colapsar', async () => {
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await enqueue({ kind: 'upsert', medicationId: MED_B });
    await enqueue({ kind: 'upsert', medicationId: MED_A });

    const ops = await readOutbox();
    expect(ops).toHaveLength(2);
    // El de A se recoloca al final por ser el mas reciente.
    expect(ops.map((o) => o.medicationId)).toEqual([MED_B, MED_A]);
  });

  it('colapsa dos marcados de la MISMA dosis', async () => {
    await enqueue({ kind: 'dose', medicationId: MED_A, scheduledFor: '2026-01-15', taken: true });
    await enqueue({ kind: 'dose', medicationId: MED_A, scheduledFor: '2026-01-15', taken: false });

    const ops = await readOutbox();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'dose', taken: false });
  });

  // Dias distintos son dosis distintas: colapsarlos perderia el historial de
  // una de las dos.
  it('no colapsa dosis de dias diferentes', async () => {
    await enqueue({ kind: 'dose', medicationId: MED_A, scheduledFor: '2026-01-15', taken: true });
    await enqueue({ kind: 'dose', medicationId: MED_A, scheduledFor: '2026-01-16', taken: true });

    expect(await outboxSize()).toBe(2);
  });

  it('una dosis no borra un upsert pendiente ni al reves', async () => {
    await enqueue({ kind: 'upsert', medicationId: MED_A });
    await enqueue({ kind: 'dose', medicationId: MED_A, scheduledFor: '2026-01-15', taken: true });

    expect(await outboxSize()).toBe(2);
  });

  it('writeOutbox reemplaza el contenido completo', async () => {
    await enqueue({ kind: 'upsert', medicationId: MED_A });

    const nuevas: OutboxOp[] = [{ kind: 'delete', medicationId: MED_B }];
    await writeOutbox(nuevas);

    expect(await readOutbox()).toEqual(nuevas);
  });

  it('sobrevive a un contenido corrupto devolviendo una cola vacia', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('@myApp/outbox', 'esto no es json');

    expect(await readOutbox()).toEqual([]);
  });
});

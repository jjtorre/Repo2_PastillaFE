// lib/sync.ts
// Motor de sincronizacion. Empuja la cola pendiente y luego baja el estado
// del servidor.
//
// Decisiones que conviene tener presentes:
//
//  - PUSH ANTES QUE PULL. Si se bajara primero, el servidor pisaria cambios
//    locales que aun no han subido.
//  - El PULL solo se aplica si la cola quedo VACIA. Con operaciones aun
//    pendientes, el servidor esta desactualizado por definicion y aplicar su
//    version haria parpadear los datos hacia atras.
//  - El pull es COMPLETO, no incremental. Un hogar tiene unos pocos
//    medicamentos; un cursor por updated_at solo anadiria bugs de reloj a
//    cambio de nada. El indice medications_sync_idx ya esta creado por si
//    algun dia hace falta.

import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import type { Medication } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { ensureSession, ensureHousehold } from './session';
import { readOutbox, writeOutbox, type OutboxOp } from './outbox';
import { readLocal, writeLocal } from './local';
import { bootstrapLocalData } from './migrate';
import { computeStatus, localToday, toLocalDateString } from './status';

type MedicationRow = {
  id: string;
  name: string;
  scheduled_time: string; // 'HH:MM:SS'
  expiration_date: string; // 'YYYY-MM-DD'
  quantity: number;
};

function toRemoteRow(med: Medication, householdId: string) {
  return {
    id: med.id,
    household_id: householdId,
    name: med.name,
    // La columna es `time`; 'HH:MM' necesita los segundos.
    scheduled_time: med.time.length === 5 ? `${med.time}:00` : med.time,
    // Se reconstruye la fecha en horario LOCAL antes de formatear, porque el
    // campo local es un ISOString completo y cortarlo daria la fecha en UTC.
    expiration_date: toLocalDateString(new Date(med.expirationDate)),
    quantity: med.quantity,
  };
}

function toLocalMedication(row: MedicationRow, takenAt: string | null): Medication {
  const base: Medication = {
    id: row.id,
    name: row.name,
    time: row.scheduled_time.slice(0, 5),
    // Sin sufijo Z se interpreta como medianoche LOCAL, que es lo que la
    // pantalla de detalle espera al formatear con toLocaleDateString.
    expirationDate: new Date(`${row.expiration_date}T00:00:00`).toISOString(),
    quantity: row.quantity,
    status: takenAt ? 'taken' : 'pending',
    lastTakenAt: takenAt,
  };
  return { ...base, status: computeStatus(base) };
}

async function applyOp(op: OutboxOp, householdId: string): Promise<boolean> {
  if (op.kind === 'upsert') {
    const local = await readLocal();
    const med = local.find((m) => m.id === op.medicationId);
    if (!med) return true; // se borro despues de encolarse: nada que subir
    const { error } = await supabase.from('medications').upsert(toRemoteRow(med, householdId));
    if (error) console.warn('upsert fallo:', error.message);
    return !error;
  }

  if (op.kind === 'delete') {
    const { error } = await supabase
      .from('medications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', op.medicationId);
    if (error) console.warn('delete fallo:', error.message);
    return !error;
  }

  // Las dosis NO se suben como un UPDATE de quantity. Van por RPC, que
  // registra el evento y descuenta el inventario en una sola transaccion y
  // es idempotente: un reintento tras perder senal no descuenta dos veces.
  const fn = op.taken ? 'record_dose' : 'undo_dose';
  const { error } = await supabase.rpc(fn, {
    p_medication_id: op.medicationId,
    p_scheduled_for: op.scheduledFor,
  });
  if (error) console.warn(`${fn} fallo:`, error.message);
  return !error;
}

async function pushOutbox(householdId: string): Promise<number> {
  const ops = await readOutbox();
  if (ops.length === 0) return 0;

  const remaining: OutboxOp[] = [];
  let failed = false;

  for (const op of ops) {
    // En cuanto una falla se detiene el drenado: el orden importa (crear
    // antes que marcar una dosis) y saltarse una romperia la secuencia.
    if (failed) {
      remaining.push(op);
      continue;
    }
    const ok = await applyOp(op, householdId);
    if (!ok) {
      failed = true;
      remaining.push(op);
    }
  }

  await writeOutbox(remaining);
  return remaining.length;
}

async function pullAll(householdId: string): Promise<boolean> {
  const { data: rows, error } = await supabase
    .from('medications')
    .select('id,name,scheduled_time,expiration_date,quantity')
    .eq('household_id', householdId)
    .is('deleted_at', null);

  if (error || !rows) {
    console.warn('pull de medicamentos fallo:', error?.message);
    return false;
  }

  // El RLS ya limita los eventos al hogar del usuario a traves del
  // medicamento, asi que no hace falta filtrar por hogar aqui.
  const { data: events } = await supabase
    .from('dose_events')
    .select('medication_id,taken_at')
    .eq('scheduled_for', localToday())
    .is('undone_at', null);

  const takenAt = new Map<string, string>();
  for (const e of events ?? []) takenAt.set(e.medication_id, e.taken_at);

  const merged = (rows as MedicationRow[]).map((row) =>
    toLocalMedication(row, takenAt.get(row.id) ?? null)
  );

  await writeLocal(merged);
  return true;
}

export type SyncResult = 'ok' | 'pendiente' | 'sin-red' | 'sin-configurar' | 'error';

let running = false;

export async function syncNow(): Promise<SyncResult> {
  if (!isSupabaseConfigured) return 'sin-configurar';
  if (running) return 'pendiente';

  running = true;
  try {
    // Solo hace algo la primera vez. Va antes del chequeo de red porque
    // reasigna los id antiguos en local, y eso debe pasar aunque no haya
    // internet: si no, se encolarian upserts con id que el servidor rechaza.
    await bootstrapLocalData();

    const net = await NetInfo.fetch();
    if (!net.isConnected) return 'sin-red';

    const userId = await ensureSession();
    if (!userId) return 'error';

    const householdId = await ensureHousehold();
    if (!householdId) return 'error';

    const stillPending = await pushOutbox(householdId);
    if (stillPending > 0) return 'pendiente';

    const pulled = await pullAll(householdId);
    return pulled ? 'ok' : 'error';
  } catch (e) {
    console.warn('Sincronizacion fallida:', e);
    return 'error';
  } finally {
    running = false;
  }
}

// Sincroniza al arrancar, al recuperar red y al volver del segundo plano.
// Devuelve la funcion de limpieza para el useEffect de App.tsx.
export function startBackgroundSync(): () => void {
  // Los id se normalizan SIEMPRE, tambien sin credenciales de Supabase.
  //
  // Si esto se dejara solo dentro de syncNow(), en modo local no correria
  // nunca: el guard de isSupabaseConfigured sale antes. Y entonces una dosis
  // marcada sin configurar quedaria encolada con el id viejo de Date.now();
  // al configurar Supabase el bootstrap le daria un UUID nuevo y esa
  // operacion apuntaria a un medicamento inexistente. Como el push se detiene
  // en el primer fallo para no romper el orden, la cola se atascaria PARA
  // SIEMPRE. Normalizar al arrancar hace que ese estado no pueda existir.
  void bootstrapLocalData().then(() => syncNow());

  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (state.isConnected) void syncNow();
  });

  const appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void syncNow();
  });

  return () => {
    unsubscribeNet();
    appStateSub.remove();
  };
}

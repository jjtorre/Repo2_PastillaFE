// lib/status.ts
// computeStatus vivia en storage.ts. Se movio aqui para romper un ciclo de
// imports: storage.ts necesita a sync.ts, y sync.ts necesita computeStatus.
// storage.ts lo vuelve a exportar, asi que las pantallas no cambian.

import type { Medication, MedicationStatus } from '../types';

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Calcula el estado real de un medicamento para "ahora", sin confiar
// ciegamente en el campo status guardado. Un medicamento marcado como
// "taken" solo se queda asi si lastTakenAt fue HOY — si fue un dia
// anterior, se recalcula como pending/late segun la hora programada.
export function computeStatus(med: Medication): MedicationStatus {
  const now = new Date();

  if (med.status === 'taken' && med.lastTakenAt) {
    const takenAt = new Date(med.lastTakenAt);
    if (isSameDay(takenAt, now)) return 'taken';
  }

  const [hours, minutes] = med.time.split(':').map(Number);
  const doseTime = new Date();
  doseTime.setHours(hours, minutes, 0, 0);

  return now > doseTime ? 'late' : 'pending';
}

// 'YYYY-MM-DD' a partir de los componentes LOCALES de la fecha.
//
// No usar toISOString().slice(0,10): eso da la fecha en UTC. En Honduras
// (UTC-6) una fecha elegida a las 6pm o mas tarde se convertiria en el dia
// SIGUIENTE. Es el mismo bug que se corrigio del lado del servidor con
// household_today().
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localToday(): string {
  return toLocalDateString(new Date());
}

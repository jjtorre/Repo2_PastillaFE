// src/lib/types.ts
// Formas de las VISTAS que consume el cuidador, no de las tablas.
//
// La app móvil lee las tablas y la web lee las vistas, así que los tipos no
// se comparten entre los dos proyectos: describen cosas distintas. Por eso no
// hay workspace de npm montado para compartir código.

export type MedicationStatus = 'pending' | 'late' | 'taken';

// public.v_medication_today — el estado se deriva en SQL con la zona horaria
// del hogar, no la del navegador del cuidador. Importa si el paciente se tomó
// la pastilla a las 8 de SU mañana.
export interface MedicationToday {
  id: string;
  household_id: string;
  name: string;
  scheduled_time: string; // 'HH:MM:SS'
  expiration_date: string; // 'YYYY-MM-DD'
  quantity: number;
  local_date: string; // 'YYYY-MM-DD' en la zona del hogar
  taken_at: string | null;
  status: MedicationStatus;
}

// public.v_adherence_30d
export interface Adherence {
  medication_id: string;
  household_id: string;
  name: string;
  doses_taken: number;
  doses_expected: number;
  adherence_pct: number;
}

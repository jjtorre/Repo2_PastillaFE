// types.ts
// Tipos compartidos por toda la app.

export type MedicationStatus = 'pending' | 'late' | 'taken';

export interface Medication {
  id: string;
  name: string;
  time: string; // formato 'HH:MM' en 24h, ej. '08:00'
  expirationDate: string; // ISOString
  quantity: number;
  status: MedicationStatus;
  lastTakenAt: string | null; // ISOString o null
}

// Datos necesarios para crear un medicamento nuevo (sin id/status, los
// asigna storage.ts).
export type NewMedicationInput = Omit<Medication, 'id' | 'status' | 'lastTakenAt'>;

// Parámetros de cada ruta del stack de navegación. Esto le da autocompletado
// y chequeo de tipos a navigation.navigate(...) en toda la app.
export type RootStackParamList = {
  MedicationList: undefined;
  AddMedication: undefined;
  MedicationDetail: { id: string };
  EditMedication: { id: string };
  CaregiverView: undefined;
};

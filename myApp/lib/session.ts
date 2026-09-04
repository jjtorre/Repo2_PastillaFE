// lib/session.ts
// Identidad y pertenencia al hogar.
//
// El paciente entra con sesion ANONIMA: es un adulto mayor y pedirle registrar
// correo y contrasena para poder usar su pastillero seria una barrera absurda.
// Firma anonima = cero fricción y la app funciona desde el primer segundo.
//
// El cuidador SI tiene cuenta real (correo) en la web, y se une al hogar con
// un codigo de invitacion. Eso cubre el punto debil de la sesion anonima: si
// el paciente pierde el telefono, la cuenta anonima se pierde, pero los datos
// siguen vivos en el hogar y el cuidador conserva el acceso.
//
// Requiere activar "Anonymous sign-ins" en el dashboard de Supabase
// (Authentication > Sign In / Providers).

import { supabase } from './supabase';
import { getHouseholdId, setHouseholdId } from './local';

export async function ensureSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn('No se pudo iniciar sesion anonima:', error.message);
    return null;
  }
  return signed.session?.user.id ?? null;
}

// Devuelve el hogar de este dispositivo, creandolo la primera vez.
// create_household es un RPC y no un INSERT directo por el problema del huevo
// y la gallina del RLS: no puedes anadirte como miembro de un hogar del que
// todavia no eres miembro.
export async function ensureHousehold(): Promise<string | null> {
  const cached = await getHouseholdId();
  if (cached) return cached;

  // Puede que este usuario ya pertenezca a un hogar (reinstalacion, o se unio
  // con un codigo). Se busca antes de crear uno nuevo para no duplicar.
  const { data: existing } = await supabase
    .from('household_members')
    .select('household_id')
    .limit(1)
    .maybeSingle();

  if (existing?.household_id) {
    await setHouseholdId(existing.household_id);
    return existing.household_id;
  }

  const { data, error } = await supabase.rpc('create_household', {
    p_name: 'Mi hogar',
    p_timezone: 'America/Tegucigalpa',
    p_role: 'patient',
  });

  if (error || !data) {
    console.warn('No se pudo crear el hogar:', error?.message);
    return null;
  }

  const id = Array.isArray(data) ? data[0]?.id : (data as { id: string }).id;
  if (!id) return null;

  await setHouseholdId(id);
  return id;
}

// Genera un codigo para que el cuidador se una al hogar desde la web.
export async function createInviteCode(): Promise<string | null> {
  const householdId = await getHouseholdId();
  if (!householdId) return null;

  // 6 caracteres, sin I/O/0/1 para que nadie los confunda al dictarlos.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('');

  const { error } = await supabase
    .from('household_invites')
    .insert({ code, household_id: householdId, role: 'caregiver' });

  if (error) {
    console.warn('No se pudo crear la invitacion:', error.message);
    return null;
  }
  return code;
}

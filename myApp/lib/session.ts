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

import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { supabase, isSupabaseConfigured } from './supabase';
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

// Alfabeto de 32 simbolos SIN I, O, 0 ni 1: el paciente va a dictar este
// codigo por telefono a su cuidador, y esos cuatro son los que se confunden.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_LENGTH = 6;

// 32 divide exactamente a 256, asi que "byte % 32" reparte los simbolos de
// forma uniforme. Con un alfabeto de otro tamano habria sesgo hacia los
// primeros caracteres.
function generateCode(): string {
  const bytes = Crypto.getRandomBytes(INVITE_LENGTH);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

export type InviteResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; reason: 'sin-configurar' | 'sin-red' | 'error' };

// Genera un codigo para que el cuidador se una al hogar desde la web.
//
// A diferencia del resto de escrituras de la app, esta NO se encola para
// sincronizar despues: un codigo que el paciente lee en pantalla tiene que
// existir ya en el servidor, o el cuidador lo escribiria y no funcionaria.
// Por eso exige red y falla de forma visible en vez de silenciosa.
export async function createInviteCode(): Promise<InviteResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'sin-configurar' };

  const net = await NetInfo.fetch();
  if (!net.isConnected) return { ok: false, reason: 'sin-red' };

  const userId = await ensureSession();
  if (!userId) return { ok: false, reason: 'error' };

  // ensureHousehold y no getHouseholdId: si el paciente nunca ha sincronizado,
  // todavia no existe hogar al que invitar y hay que crearlo ahora.
  const householdId = await ensureHousehold();
  if (!householdId) return { ok: false, reason: 'error' };

  // El codigo es la clave primaria de la tabla. Con 32^6 combinaciones la
  // colision es improbable, pero no imposible, y perder la invitacion por eso
  // seria absurdo: se reintenta con un codigo nuevo.
  for (let intento = 0; intento < 5; intento++) {
    const code = generateCode();

    const { data, error } = await supabase
      .from('household_invites')
      .insert({ code, household_id: householdId, role: 'caregiver', created_by: userId })
      .select('code, expires_at')
      .single();

    if (!error && data) {
      return { ok: true, code: data.code, expiresAt: data.expires_at };
    }

    // 23505 = unique_violation. Cualquier otro error no se arregla
    // reintentando, asi que se corta.
    if (error && error.code !== '23505') {
      console.warn('No se pudo crear la invitacion:', error.message);
      return { ok: false, reason: 'error' };
    }
  }

  return { ok: false, reason: 'error' };
}

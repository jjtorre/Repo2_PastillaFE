// lib/supabase.ts
// Cliente de Supabase. Las credenciales llegan por variables EXPO_PUBLIC_*,
// que Expo incrusta en el bundle al compilar (ver .env.example).
//
// La clave anon NO es un secreto: va en el cliente por diseno y lo que
// protege los datos es el RLS del esquema, no ocultarla.

import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Sin credenciales la app sigue funcionando: 100% local, sin sincronizar.
// Es el mismo comportamiento que tenia antes de esta migracion.
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // En React Native no hay URL de la que leer la sesion; dejarlo en true
      // hace que el cliente intente tocar window.location y falle.
      detectSessionInUrl: false,
    },
  }
);

// El refresco automatico del token debe pausarse con la app en segundo plano:
// si no, el temporizador sigue vivo y quema bateria y red sin necesidad.
if (isSupabaseConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

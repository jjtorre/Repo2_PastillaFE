// src/lib/supabase.ts
// Cliente de Supabase para la web del cuidador.
//
// Usa exactamente la MISMA clave anon que la app móvil. No hace falta ninguna
// credencial nueva: lo que separa a un hogar de otro es el RLS del esquema
// (ver Migration/007_rls.sql), no la clave.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Sin credenciales la app arranca igual y muestra un aviso explicando qué
// falta, en vez de romperse con un error en blanco en la consola.
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key'
);

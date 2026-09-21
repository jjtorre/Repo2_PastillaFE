// api/health.ts
// Healthcheck de la API, en GET /api/health.
//
// Usa la firma clásica (req, res) de @vercel/node en lugar del formato
// `export default { fetch }`. El segundo es más moderno y más limpio, pero el
// despliegue lo rechazó y tumbó la publicación entera: el sitio se quedó
// servido desde la versión anterior. Esta firma lleva años soportada.
//
// No se limita a devolver {"status":"ok"}: eso solo probaría que Vercel puede
// ejecutar una función, que es justo lo que nunca falla. Aquí se consulta
// Supabase de verdad, porque lo que puede caerse es la base de datos.
//
// La consulta pide una fila de `medications` con la clave anon y sin sesión.
// El RLS devuelve un array vacío, así que un 200 con [] confirma cuatro cosas
// a la vez: hay red, PostgREST responde, la base contesta, y el RLS está
// activo. Si llegaran filas se reporta como degradado: devolver datos aquí
// sería una fuga.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

const TIMEOUT_MS = 4000;

interface Check {
  status: 'ok' | 'error' | 'sin-configurar';
  latencyMs?: number;
  detail?: string;
}

async function comprobarBaseDeDatos(): Promise<Check> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      status: 'sin-configurar',
      detail: 'Faltan las variables de entorno de Supabase',
    };
  }

  const inicio = Date.now();

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/medications?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const latencyMs = Date.now() - inicio;

    if (!res.ok) {
      return { status: 'error', latencyMs, detail: `PostgREST respondió ${res.status}` };
    }

    const filas: unknown = await res.json();

    // Sin sesión no debería verse ni una fila. Si llegan, el aislamiento
    // entre hogares no está funcionando.
    if (Array.isArray(filas) && filas.length > 0) {
      return {
        status: 'error',
        latencyMs,
        detail: 'El RLS no está filtrando: una petición anónima recibió filas',
      };
    }

    return { status: 'ok', latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - inicio;
    const esTimeout = e instanceof Error && e.name === 'TimeoutError';
    return {
      status: 'error',
      latencyMs,
      detail: esTimeout
        ? `Sin respuesta en ${TIMEOUT_MS} ms`
        : 'No se pudo contactar con Supabase',
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ status: 'error', detail: 'Solo se admite GET' });
    return;
  }

  const database = await comprobarBaseDeDatos();
  const sano = database.status === 'ok';

  // Un healthcheck cacheado informaría del pasado, que es peor que no tenerlo.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  // 503 cuando algo falla, para que un monitor pueda alertar por el código de
  // estado sin tener que interpretar el JSON.
  res.status(sano ? 200 : 503).json({
    // "degraded" y no "error": la web sigue sirviéndose aunque la base no
    // responda; lo que se pierde son los datos, no el sitio.
    status: sano ? 'ok' : 'degraded',
    service: 'pastilla-api',
    timestamp: new Date().toISOString(),
    version: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'desconocido',
      environment: process.env.VERCEL_ENV ?? 'local',
      region: process.env.VERCEL_REGION ?? 'desconocida',
    },
    checks: { database },
  });
}

// api/health.ts
// Healthcheck de la API, en GET /api/health.
//
// No se limita a devolver {"status":"ok"}: eso solo probaría que Vercel puede
// ejecutar una función, que es justo lo que nunca falla. Aquí se consulta
// Supabase de verdad, porque lo que puede caerse es la base de datos, no esta
// función.
//
// La consulta pide una fila de `medications` con la clave anon y sin sesión.
// El RLS devuelve un array vacío, así que un 200 con [] confirma cuatro cosas
// a la vez: hay red, PostgREST responde, la base contesta, y el RLS está
// activo. Si el RLS estuviera caído llegarían filas, y eso se reporta como
// degradado: devolver datos aquí sería una fuga.

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

const TIMEOUT_MS = 4000;

type EstadoCheck = 'ok' | 'error' | 'sin-configurar';

interface Check {
  status: EstadoCheck;
  latencyMs?: number;
  detail?: string;
}

async function comprobarBaseDeDatos(): Promise<Check> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { status: 'sin-configurar', detail: 'Faltan las variables de entorno de Supabase' };
  }

  const inicio = Date.now();
  const abortar = AbortSignal.timeout(TIMEOUT_MS);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/medications?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: abortar,
    });

    const latencyMs = Date.now() - inicio;

    if (!res.ok) {
      return { status: 'error', latencyMs, detail: `PostgREST respondió ${res.status}` };
    }

    const filas = (await res.json()) as unknown[];

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
    const detail = e instanceof Error && e.name === 'TimeoutError'
      ? `Sin respuesta en ${TIMEOUT_MS} ms`
      : 'No se pudo contactar con Supabase';
    return { status: 'error', latencyMs, detail };
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return Response.json(
        { status: 'error', detail: 'Solo se admite GET' },
        { status: 405, headers: { Allow: 'GET, HEAD' } }
      );
    }

    const database = await comprobarBaseDeDatos();
    const sano = database.status === 'ok';

    const cuerpo = {
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
    };

    // 503 cuando algo falla, para que un monitor pueda alertar por el código
    // de estado sin tener que interpretar el JSON.
    return Response.json(cuerpo, {
      status: sano ? 200 : 503,
      headers: {
        // Un healthcheck cacheado no sirve de nada: informaría del pasado.
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  },
};

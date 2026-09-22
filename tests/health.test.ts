import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// La funcion lee las variables al importarse, asi que hay que fijarlas antes
// y volver a importar el modulo en cada bloque.
async function cargarHandler() {
  vi.resetModules();
  const mod = await import('../web/api/health');
  return mod.default as (req: unknown, res: unknown) => Promise<void>;
}

function respuestaFalsa() {
  const cabeceras: Record<string, string> = {};
  const captura = {
    codigo: 0 as number,
    cuerpo: undefined as unknown,
    cabeceras,
    setHeader(k: string, v: string) {
      cabeceras[k] = v;
    },
    status(c: number) {
      captura.codigo = c;
      return captura;
    },
    json(b: unknown) {
      captura.cuerpo = b;
      return captura;
    },
  };
  return captura;
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'clave-anon';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
});

describe('healthcheck', () => {
  it('responde 200 cuando la base contesta y no filtra filas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 }))
    );

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'GET' }, res);

    expect(res.codigo).toBe(200);
    expect(res.cuerpo).toMatchObject({
      status: 'ok',
      service: 'pastilla-api',
      checks: { database: { status: 'ok' } },
    });
  });

  it('nunca se cachea', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'GET' }, res);

    expect(res.cabeceras['Cache-Control']).toContain('no-store');
  });

  // El punto que distingue este healthcheck de uno decorativo: una peticion
  // anonima que recibe filas significa que el aislamiento entre hogares no
  // esta funcionando. Eso no es salud, es una fuga.
  it('reporta degradado si una peticion anonima recibe filas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ id: 'med-1' }]), { status: 200 }))
    );

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'GET' }, res);

    expect(res.codigo).toBe(503);
    expect(res.cuerpo).toMatchObject({ status: 'degraded' });
    expect((res.cuerpo as any).checks.database.detail).toMatch(/RLS/);
  });

  it('reporta degradado si PostgREST responde con error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'GET' }, res);

    expect(res.codigo).toBe(503);
    expect((res.cuerpo as any).checks.database.detail).toContain('500');
  });

  it('reporta degradado si no hay forma de contactar con Supabase', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ENOTFOUND');
      })
    );

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'GET' }, res);

    expect(res.codigo).toBe(503);
    expect((res.cuerpo as any).checks.database.status).toBe('error');
  });

  it('distingue un tiempo de espera agotado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const e = new Error('agotado');
        e.name = 'TimeoutError';
        throw e;
      })
    );

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'GET' }, res);

    expect((res.cuerpo as any).checks.database.detail).toMatch(/Sin respuesta/);
  });

  it('avisa si faltan las variables de entorno', async () => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'GET' }, res);

    expect(res.codigo).toBe(503);
    expect((res.cuerpo as any).checks.database.status).toBe('sin-configurar');
  });

  it('rechaza metodos distintos de GET', async () => {
    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'POST' }, res);

    expect(res.codigo).toBe(405);
    expect(res.cabeceras['Allow']).toBe('GET, HEAD');
  });

  it('admite HEAD', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));

    const handler = await cargarHandler();
    const res = respuestaFalsa();
    await handler({ method: 'HEAD' }, res);

    expect(res.codigo).toBe(200);
  });

  it('prefiere las variables sin prefijo cuando existen', async () => {
    process.env.SUPABASE_URL = 'https://servidor.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'clave-servidor';

    const espia = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', espia);

    const handler = await cargarHandler();
    await handler({ method: 'GET' }, respuestaFalsa());

    expect(espia.mock.calls[0][0]).toContain('servidor.supabase.co');
  });
});

// middleware.ts — Portón de borde para el portal privado
//
// QUÉ ES Y QUÉ NO ES. Esto impide que /panel se SIRVA a una petición sin
// sesión: antes devolvía 200 con el armazón de la aplicación a cualquiera que
// pidiera la URL. Ese armazón no contenía ni un dato —los datos exigen sesión
// y los filtra la seguridad por fila de la base— pero servirlo igualmente es
// indefendible para una ruta declarada como privada.
//
// La autorización real NO vive aquí y no debe confundirse con esto. Vive en
// las políticas de la base de datos (ver docs/adr/ADR-002). La cookie que se
// comprueba abajo es una PISTA, no una credencial: no autoriza nada, y
// falsificarla solo consigue que te sirvan una aplicación vacía, porque cada
// consulta seguirá devolviendo cero filas sin una sesión válida.
//
// Existe porque Supabase guarda la sesión en localStorage, que el servidor no
// puede ver. La aplicación deja esta marca cuando hay sesión y la borra al
// cerrarla, y es lo único que el borde puede mirar.

export const config = {
  runtime: 'edge',
};

const COOKIE_SESION = 'pastilla_sesion';

const PAGINA_401 = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Acceso restringido · Pastilla</title>
    <style>
      body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
        padding:24px;background:#FBF8F3;color:#1F3A3D;
        font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
      main{max-width:420px;text-align:center;background:#fff;border:1px solid #E5DFD3;
        border-radius:16px;padding:40px 32px}
      h1{font-size:22px;margin:0 0 12px}
      p{color:#8B7355;line-height:1.55;margin:0 0 28px}
      a{display:inline-block;background:#2D6E5E;color:#FBF8F3;text-decoration:none;
        font-weight:600;padding:14px 28px;border-radius:28px}
    </style>
  </head>
  <body>
    <main>
      <h1>Acceso restringido</h1>
      <!-- Sin vocabulario del dominio a propósito: una página de denegación no
           debe describir qué hay detrás, ni siquiera de forma genérica. -->
      <p>Esta página es privada. Entra con tu cuenta para continuar.</p>
      <a href="/">Ir al inicio</a>
    </main>
  </body>
</html>`;

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);

  // Solo el portal privado. El resto del sitio —la landing, los recursos, el
  // healthcheck— sigue siendo público y no pasa por aquí.
  if (!url.pathname.startsWith('/panel')) return undefined;

  const cookies = request.headers.get('cookie') ?? '';
  const tieneSesion = cookies
    .split(';')
    .some((c) => c.trim().startsWith(`${COOKIE_SESION}=`));

  if (tieneSesion) return undefined;

  return new Response(PAGINA_401, {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Una respuesta de denegación cacheada se la comería el siguiente
      // usuario, que quizá sí tiene sesión.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

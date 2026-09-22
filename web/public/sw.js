// sw.js — Service worker del panel del cuidador
//
// LA FRONTERA: se cachea el armazón de la aplicación, NUNCA los datos médicos.
//
// Es la decisión central de este archivo y va en contra de lo que suele
// hacerse. Un panel que muestra si una persona mayor se tomó su medicina no
// puede enseñar datos viejos sin avisar: el cuidador vería "tomado" y se
// quedaría tranquilo con información de hace horas. Quedarse sin datos es
// molesto; mostrar datos caducados como si fueran de ahora es peligroso.
//
// Por eso, sin conexión, la aplicación ABRE y explica que no hay red, en lugar
// de pintar el último estado conocido.

const CACHE_NAME = 'pastilla-shell-v1';

// Lo que se guarda al instalar. Son rutas estables: los bundles llevan hash en
// el nombre y no se pueden conocer aquí, así que entran en caché la primera
// vez que se piden (ver la estrategia de abajo).
const ARMAZON = [
  '/',
  '/404.html',
  '/favicon.svg',
  '/icon-1024.png',
  '/manifest.webmanifest',
];

// Orígenes y rutas que jamás se guardan.
function esDatoVivo(url) {
  // Supabase: medicamentos, dosis, sesiones. Nada de esto puede servirse viejo.
  if (url.origin !== self.location.origin) return true;
  // El healthcheck informa del estado AHORA; cacheado mentiría por definición.
  if (url.pathname.startsWith('/api/')) return true;
  return false;
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_NAME)
      // addAll falla entero si un recurso falla. Se piden de a uno para que un
      // archivo ausente no impida instalar el resto.
      .then((cache) =>
        Promise.all(
          ARMAZON.map((ruta) => cache.add(ruta).catch(() => undefined))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((n) => n !== CACHE_NAME)
            .map((n) => caches.delete(n))
        )
      )
      // Toma el control de las pestañas ya abiertas sin esperar a que se
      // recarguen, para que una versión nueva no conviva con la anterior.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Solo lecturas. Un POST o un PATCH no se cachean nunca.
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  // Datos vivos: se dejan pasar sin tocar. Si no hay red, la petición falla y
  // la aplicación muestra su propio mensaje, que es el comportamiento buscado.
  if (esDatoVivo(url)) return;

  // Navegaciones: primero la red, para que un despliegue nuevo se vea sin
  // tener que borrar nada. Si no hay red, se sirve el armazón guardado y la
  // aplicación arranca igual.
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copia));
          return respuesta;
        })
        .catch(() => caches.match('/').then((r) => r ?? caches.match('/404.html')))
    );
    return;
  }

  // ESTRATEGIA PRINCIPAL — cache-first para el resto de recursos propios.
  //
  // Los bundles de Vite llevan un hash del contenido en el nombre, así que una
  // URL dada es inmutable: si cambia el archivo, cambia la URL. Servirlos
  // desde caché sin preguntar a la red es correcto y ahorra la espera.
  evento.respondWith(
    caches.match(peticion).then((enCache) => {
      if (enCache) return enCache;

      return fetch(peticion).then((respuesta) => {
        // Las respuestas parciales o con error no se guardan: envenenarían la
        // caché con contenido roto.
        if (!respuesta.ok || respuesta.status === 206) return respuesta;

        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(peticion, copia));
        return respuesta;
      });
    })
  );
});

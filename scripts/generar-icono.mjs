// scripts/generar-icono.mjs
//
// Genera los iconos del producto: una cápsula inclinada sobre el verde de la
// marca. Sin dependencias — escribe el PNG a mano con el zlib de Node.
//
// Existe como script y no como un archivo binario suelto para que el icono sea
// REPRODUCIBLE: cambiar un color o la inclinación es editar una constante y
// volver a ejecutar, en lugar de abrir un editor gráfico y perder el original.
//
//   node scripts/generar-icono.mjs
//
// El motivo se mantiene dentro del 60% central de la imagen a propósito.
// Android recorta los iconos adaptativos en círculo, cuadrado o gota según el
// lanzador, y todo lo que quede fuera de esa zona se pierde.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');

// Paleta, la misma de myApp/theme.ts
const VERDE = [0x2d, 0x6e, 0x5e];
const CREMA = [0xfb, 0xf8, 0xf3];
const VERDE_CLARO = [0xe8, 0xef, 0xe9];

// ---------------------------------------------------------------------------
// Codificación PNG
// ---------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function escribirPNG(ancho, alto, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // 10,11,12 quedan en 0: compresión, filtro e interlazado estándar

  // Cada fila lleva delante un byte de filtro. Se usa 0 (sin filtrar): el
  // dibujo son áreas planas y zlib ya las comprime bien.
  const crudo = Buffer.alloc(alto * (1 + ancho * 4));
  for (let y = 0; y < alto; y++) {
    const destino = y * (1 + ancho * 4);
    crudo[destino] = 0;
    pixeles.copy(crudo, destino + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------

// Distancia de un punto al segmento que forma el eje de la cápsula.
function distanciaASegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  let t = largo2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function colorEn(x, y, ancho, alto, escalaContenido) {
  const cx = ancho / 2;
  const cy = alto / 2;

  // El motivo se dimensiona contra el lado corto, para que el banner ancho no
  // lo estire.
  const base = Math.min(ancho, alto) * escalaContenido;
  const radio = base * 0.21;
  const medioLargo = base * 0.27;

  const ang = (-38 * Math.PI) / 180;
  const ex = Math.cos(ang) * medioLargo;
  const ey = Math.sin(ang) * medioLargo;

  const d = distanciaASegmento(x, y, cx - ex, cy - ey, cx + ex, cy + ey);
  if (d > radio) return VERDE;

  // Proyección sobre el eje: decide en qué mitad de la cápsula cae el punto.
  const proy = ((x - cx) * Math.cos(ang) + (y - cy) * Math.sin(ang)) / medioLargo;

  // La ranura central se dibuja del color del fondo, así la cápsula se lee
  // como dos mitades unidas y no como una pastilla lisa.
  if (Math.abs(proy) < 0.055) return VERDE;

  return proy < 0 ? CREMA : VERDE_CLARO;
}

function generar({ ancho, alto, escalaContenido, muestras = 3 }) {
  const px = Buffer.alloc(ancho * alto * 4);

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      // Supermuestreo: se promedian varias muestras por píxel para que los
      // bordes curvos no salgan dentados.
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < muestras; sy++) {
        for (let sx = 0; sx < muestras; sx++) {
          const c = colorEn(
            x + (sx + 0.5) / muestras,
            y + (sy + 0.5) / muestras,
            ancho, alto, escalaContenido
          );
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = muestras * muestras;
      const i = (y * ancho + x) * 4;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = 255;
    }
  }

  return escribirPNG(ancho, alto, px);
}

// ---------------------------------------------------------------------------

const SALIDAS = [
  // Icono principal de la app y de la PWA. No llega al borde: iOS redondea las
  // esquinas y una cápsula a ras del marco se ve apretada.
  { ruta: 'myApp/assets/icon.png',            ancho: 1024, alto: 1024, escala: 0.82 },
  { ruta: 'web/public/icon-1024.png',         ancho: 1024, alto: 1024, escala: 0.82 },
  // Android recorta: el motivo va más pequeño para sobrevivir a la máscara.
  { ruta: 'myApp/assets/adaptive-icon.png',   ancho: 1024, alto: 1024, escala: 0.60 },
  // La pantalla de carga muestra el motivo con más aire alrededor.
  { ruta: 'myApp/assets/splash-icon.png',     ancho: 1024, alto: 1024, escala: 0.50 },
  { ruta: 'myApp/assets/favicon.png',         ancho: 48,   alto: 48,   escala: 1.0 },
  // Vista previa al compartir: 1200x630 es la proporción que esperan las
  // redes; una imagen cuadrada se recorta por arriba y por abajo.
  { ruta: 'web/public/og-image.png',          ancho: 1200, alto: 630,  escala: 1.15 },
];

for (const { ruta, ancho, alto, escala } of SALIDAS) {
  const destino = resolve(RAIZ, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  const png = generar({ ancho, alto, escalaContenido: escala });
  writeFileSync(destino, png);
  console.log(`  ${ruta.padEnd(34)} ${ancho}x${alto}  ${(png.length / 1024).toFixed(1)} KB`);
}

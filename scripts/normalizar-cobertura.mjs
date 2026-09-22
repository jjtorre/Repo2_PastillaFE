// scripts/normalizar-cobertura.mjs
//
// Istanbul escribe las rutas tal y como las ve el sistema donde corre:
// absolutas y, en Windows, con barras invertidas. Eso deja dos problemas en
// los informes que se versionan:
//
//   1. No son portables. SonarCloud, Codecov y casi cualquier consumidor de
//      LCOV corren en Linux y no saben resolver "myApp\storage.ts".
//   2. Filtran la estructura de carpetas de la maquina de quien los genero,
//      que no pinta nada en un repositorio.
//
// Esto los reescribe como rutas relativas a la raiz con barras normales, de
// forma que el informe diga lo mismo lo genere quien lo genere.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');

function aRelativa(ruta) {
  const limpia = ruta.replace(/\\/g, '/');
  const absoluta = resolve(limpia);
  // Si esta dentro del repositorio se acorta; si no, se deja como estaba.
  if (absoluta.startsWith(raiz)) {
    return relative(raiz, absoluta).replace(/\\/g, '/');
  }
  return limpia;
}

function normalizarLcov(archivo) {
  if (!existsSync(archivo)) return 0;

  let cambios = 0;
  const salida = readFileSync(archivo, 'utf8')
    .split('\n')
    .map((linea) => {
      if (!linea.startsWith('SF:')) return linea;
      const original = linea.slice(3);
      const nueva = aRelativa(original);
      if (nueva !== original) cambios++;
      return `SF:${nueva}`;
    })
    .join('\n');

  writeFileSync(archivo, salida);
  return cambios;
}

function normalizarResumen(archivo) {
  if (!existsSync(archivo)) return 0;

  const original = JSON.parse(readFileSync(archivo, 'utf8'));
  const salida = {};
  let cambios = 0;

  for (const [clave, valor] of Object.entries(original)) {
    // "total" es un agregado, no un archivo.
    if (clave === 'total') {
      salida[clave] = valor;
      continue;
    }
    const nueva = aRelativa(clave);
    if (nueva !== clave) cambios++;
    salida[nueva] = valor;
  }

  writeFileSync(archivo, `${JSON.stringify(salida, null, 2)}\n`);
  return cambios;
}

const enLcov = normalizarLcov(resolve(raiz, 'coverage/lcov.info'));
const enResumen = normalizarResumen(resolve(raiz, 'coverage/coverage-summary.json'));

console.log(
  `Rutas normalizadas — lcov.info: ${enLcov}, coverage-summary.json: ${enResumen}`
);

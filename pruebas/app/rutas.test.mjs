/**
 * Toda ruta de fichero citada en los workflows, package.json, vite.config.js,
 * el README y CLAUDE.md existe. El bot de mantenimiento reescribía
 * `src/engine/rules.js` por ruta literal y `claude.yml` permitía
 * `scripts/test-engine.mjs`: con la reescritura, una ruta vieja en un
 * workflow es un bot que falla el lunes sin que nadie lo vea hasta el martes.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, terminar, RAIZ, leerTexto } from '../arnes.mjs';

const FUENTES = [
  ...readdirSync(join(RAIZ, '.github/workflows')).map((f) => `.github/workflows/${f}`),
  'package.json', 'vite.config.js', 'README.md', 'CLAUDE.md',
];
// Rutas con la forma de un fichero del repositorio. Los nombres sueltos
// («modelo.js») no se comprueban: en las lecciones de CLAUDE.md son historia.
const RUTA = /\b((?:src|scripts|pruebas|public|historial|\.github)\/[\w./-]+\.(?:js|jsx|mjs|json|jsonl|yml|css|md))\b/g;

test('toda ruta citada en workflows, configuración y documentación existe', () => {
  const faltan = [];
  for (const f of FUENTES) {
    const texto = leerTexto(f);
    for (const m of texto.matchAll(RUTA)) {
      const ruta = m[1];
      // Comodines y ejemplos: `src/**/*.jsx`, `public/heroes/{id}.jpg`.
      if (/[*{}]/.test(ruta)) continue;
      // Los temporales de los workflows (/tmp/...) no llevan estos prefijos, pero
      // `public/data/roam-meta.json` sí existe y se comprueba.
      if (!existsSync(join(RAIZ, ruta))) faltan.push(`${f}: ${ruta}`);
    }
  }
  ok(!faltan.length, `rutas que ya no existen:\n    ${[...new Set(faltan)].join('\n    ')}`);
});

// El guardarraíl de la ingesta (que toda llamada lleve `--out` y pase por
// comparar-ingesta) vive en pruebas/scripts/workflows.test.mjs, «los workflows
// que publican datos pasan por el guardarrail»: allí se comprueba que la
// comparación es un MANDATO y no una mención -`run: echo "antes: node
// scripts/comparar-ingesta.mjs"` pasaba una guarda por texto como la que había
// aquí-, y que ningún workflow nuevo llama a la ingesta fuera de la lista.

await terminar('app/rutas');

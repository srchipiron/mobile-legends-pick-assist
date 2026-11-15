/**
 * Que la pantalla del Veredicto siga siendo honesta, con sus tres reglas: el
 * margen en la MISMA frase que la diferencia, nada afirmado mientras quepa en
 * él, y la trampa dicha (no está aleatorizado). Se pinta el componente de
 * verdad (esbuild + react-dom/server) y se mira el TEXTO que sale: mirar el
 * código pasaría con un comentario que citara las reglas.
 */
import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after } from 'node:test';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';
import { resumen } from '../../src/motor/registro.js';

const dir = mkdtempSync(join(tmpdir(), 'veredicto-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const salida = join(dir, 'veredicto.cjs');
buildSync({
  stdin: { contents: `import { createElement } from 'react';\nimport { renderToStaticMarkup } from 'react-dom/server';\nimport { Veredicto } from ${JSON.stringify(join(RAIZ, 'src/app/componentes/Veredicto.jsx'))};\nexport const pintar = (p) => renderToStaticMarkup(createElement(Veredicto, p));\n`, resolveDir: RAIZ, loader: 'jsx' },
  bundle: true, platform: 'node', format: 'cjs', outfile: salida, jsx: 'automatic', logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const { pintar } = createRequire(import.meta.url)(salida);
const texto = (html) => html.replace(/<[^>]+>/g, '\n').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

const t0 = Date.parse('2026-09-01T10:00:00Z');
const maestria = { Akai: { games: 400, winRate: 0.52 } };
const siguiendo = (n, ganadas) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 3600000, pick: 'Akai', gane: i < ganadas, recomendados: ['Akai'] }));
const ramas = (nCon, gCon, nSin, gSin) => [
  ...siguiendo(nCon, gCon),
  ...Array.from({ length: nSin }, (_, i) => ({ t: t0 + 1e9 + i, pick: 'Akai', gane: i < gSin, recomendados: ['Tigreal'] })),
];
/** La línea de la pantalla que contiene `trozo`. */
const linea = (html, trozo) => texto(html).split('\n').find((l) => l.includes(trozo)) ?? '';

test('con once partidas al 73% la pantalla pinta la diferencia CON su margen, no afirma nada y dice la trampa', () => {
  const partidas = siguiendo(11, 8);
  const c = resumen(partidas, maestria).contraReferencia;
  ok(c && c.margen > 0 && !c.seVe, `el motor afirma con 11 partidas: ${JSON.stringify(c)}`);
  const html = pintar({ partidas, maestria });
  const dif = linea(html, 'puntos, con un margen de');
  ok(/[+−][\d,]+ puntos, con un margen de ±[\d,]+/.test(dif), `la diferencia sale sin su margen en la misma frase: «${dif}»`);
  ok(texto(html).includes('El margen se come la diferencia'), 'con la diferencia dentro del margen se afirma algo');
  ok(!texto(html).includes('ya no cabe en el azar'), 'dice que funciona sin salir del margen');
  ok(texto(html).includes('no es un experimento controlado'), 'no dice la trampa');
});

test('fuera del margen sí lo dice; y con menos de cinco siguiendo no pinta ninguna cifra', () => {
  const html = pintar({ partidas: siguiendo(200, 170), maestria });
  ok(texto(html).includes('ya no cabe en el azar'), 'con 170 de 200 no afirma nada');
  ok(/con un margen de ±/.test(texto(html)), 'al afirmar quita el margen');
  const pocas = pintar({ partidas: siguiendo(3, 3), maestria });
  ok(!/con un margen de/.test(texto(pocas)) && texto(pocas).includes('no es un experimento controlado'), 'con tres partidas pinta una diferencia');
  ok(!pocas.includes('veredicto-cifra'), 'con tres partidas pinta tu winrate siguiendo a la app');
});

test('siguiendo contra por libre: solo con 30 y 30, con margen en la misma frase y sin afirmar mientras quepa', () => {
  eq(resumen(ramas(63, 44, 29, 21), maestria).entreRamas, null, 'con menos de 30 por libre ya compara');
  const html = pintar({ partidas: ramas(63, 44, 32, 23), maestria });
  const frase = linea(html, 'frente a por libre');
  ok(/frente a por libre [\d,]+% \(32\): [+−][\d,]+ puntos, con un margen de ±[\d,]+/.test(frase), `sin margen en la misma frase: «${frase}»`);
  ok(texto(html).includes('Esa diferencia cabe en el margen'), 'con 69,8% frente a 71,9% afirma algo');
  // Una rama ganada entera no da margen cero (error agrupado, no Wald).
  const entera = resumen(ramas(30, 30, 30, 0), maestria).entreRamas;
  ok(entera.margen > 0 && entera.seVe, JSON.stringify(entera));
  ok(!texto(pintar({ partidas: ramas(100, 90, 100, 40), maestria })).includes('Esa diferencia cabe en el margen'), 'con 90% frente a 40% no se distingue nada');
});

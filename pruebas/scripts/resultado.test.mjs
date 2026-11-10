/**
 * Leer VICTORIA / DERROTA (scripts/lector/resultado.mjs, 3.32.0; zona y
 * plantillas rehechas en 3.99.0) con tablas REALES de partidas de Javi
 * (franjas de arriba a 320 px de las incidencias #85–#154 y de la tablet, con
 * los nombres de los jugadores tapados), DISTINTAS de las cuatro de serie:
 * una victoria, una derrota, una derrota con el botón «¿Cómo acabó?» de la
 * APK encima, una tapada por la cola «Esperando», la derrota que la tablet
 * apuntó como victoria el 27 de octubre de 2026 (#154), y las otras pantallas
 * del final (estadísticas y las dos de rango).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';
import { esTabla, reconocerResultado, plantillasIniciales, vectorPalabra, parecidoMaximo, ZONA_PALABRA, RESULTADO_MINIMO, TABLA_MINIMA, DESPLAZAMIENTO } from '../../scripts/lector/resultado.mjs';
import { plantillasDeSerie } from '../../scripts/lector/servir.mjs';

const franja = (n) => leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/finales', `${n}.png`)));
const victoria = franja('tabla-victoria'), derrota = franja('tabla-derrota');
const conAviso = franja('tabla-derrota-aviso'), tapada = franja('tabla-tapada'), leidaMal = franja('tabla-derrota-leida-victoria');
const otras = { estadisticas: franja('estadisticas'), rangoVictoria: franja('rango-victoria'), rangoDerrota: franja('rango-derrota') };
const serie = plantillasDeSerie();

/** La franja desplazada (dx, dy) píxeles, rellenando con negro. */
const desplazada = (t, dx, dy) => { const rgba = new Uint8Array(t.rgba.length); for (let y = 0; y < t.alto; y++) for (let x = 0; x < t.ancho; x++) { const sx = x - dx, sy = y - dy; if (sx >= 0 && sy >= 0 && sx < t.ancho && sy < t.alto) rgba.set(t.rgba.subarray((sy * t.ancho + sx) * 4, (sy * t.ancho + sx) * 4 + 4), (y * t.ancho + x) * 4); } return { ...t, rgba }; };

test('de serie van dos victorias y dos derrotas, y la tabla se distingue por su cabecera de las otras pantallas del final', () => {
  ok(serie.gane.length === 2 && serie.perdi.length === 2 && serie.tablas.length === 4, `las plantillas de serie no son dos y dos: ${serie.gane.length}/${serie.perdi.length}`);
  for (const [n, t] of Object.entries({ victoria, derrota, conAviso, leidaMal })) ok(esTabla(t, serie), `la tabla «${n}» no pasa por tabla (${reconocerResultado(t, serie).parecidoTabla.toFixed(2)})`);
  for (const [n, t] of Object.entries(otras)) ok(!esTabla(t, serie), `${n} pasa por la tabla de resultado (${reconocerResultado(t, serie).parecidoTabla.toFixed(2)} ≥ ${TABLA_MINIMA})`);
});

test('VICTORY y DEFEAT de otras partidas se leen bien, también desplazadas; la derrota de #154 que la tablet apuntó como victoria sale derrota', () => {
  for (const [t, esperado, n] of [[victoria, 'gane', 'victoria'], [derrota, 'perdi', 'derrota'], [leidaMal, 'perdi', 'la derrota de #154'], [conAviso, 'perdi', 'la derrota con el botón «¿Cómo acabó?» encima']]) {
    const r = reconocerResultado(t, serie);
    ok(r.resultado === esperado && r.parecido >= RESULTADO_MINIMO, `${n} no se lee como ${esperado}: ${JSON.stringify(r)}`);
    for (const [dx, dy] of [[DESPLAZAMIENTO, 0], [-DESPLAZAMIENTO, DESPLAZAMIENTO], [1, -1]]) eq(reconocerResultado(desplazada(t, dx, dy), serie).resultado, esperado, `${n} desplazada (${dx}, ${dy}) no se lee`);
  }
});

test('la palabra de la zona separa: la misma de otra partida se parece mucho más que la contraria (medido: ≥ 0,975 frente a ≤ 0,31)', () => {
  const mismo = Math.min(parecidoMaximo(victoria, serie.gane[0].v, vectorPalabra), parecidoMaximo(derrota, serie.perdi[0].v, vectorPalabra));
  const contrario = Math.max(parecidoMaximo(victoria, serie.perdi[0].v, vectorPalabra), parecidoMaximo(derrota, serie.gane[0].v, vectorPalabra), parecidoMaximo(leidaMal, serie.gane[1].v, vectorPalabra));
  ok(mismo >= 0.95 && contrario <= 0.5, `la zona de la palabra no separa victoria y derrota: misma ${mismo.toFixed(2)}, contraria ${contrario.toFixed(2)} (zona ${ZONA_PALABRA})`);
});

test('lo tapado, lo que no es la tabla y lo ambiguo no dan resultado: se pregunta (fallo seguro)', () => {
  const t = reconocerResultado(tapada, serie);
  ok(t.resultado === null, `la tabla tapada por la cola «Esperando» da un resultado: ${JSON.stringify(t)}`);
  for (const [n, f] of Object.entries(otras)) eq(reconocerResultado(f, serie).resultado, null, `${n} da un resultado`);
  // Con la MISMA palabra como plantilla de las dos no se decide: hace falta margen.
  const empate = { ...serie, gane: [...serie.gane, { v: vectorPalabra(derrota), de: 'x' }] };
  const e = reconocerResultado(derrota, empate);
  ok(e.resultado === null && e.parecido >= RESULTADO_MINIMO, `con las dos plantillas iguales decide: ${JSON.stringify(e)}`);
  // Sin plantillas de ninguna clase no hay tabla ni resultado.
  eq(reconocerResultado(derrota, { gane: [], perdi: [], tablas: [] }).resultado, null, 'sin plantillas inventa un resultado');
  eq(reconocerResultado(derrota, plantillasIniciales()).resultado, null, 'sin tablas de serie inventa un resultado');
});

await terminar('scripts/resultado');

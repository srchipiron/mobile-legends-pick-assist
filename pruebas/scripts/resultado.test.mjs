/**
 * Leer VICTORIA / DERROTA (scripts/lector/resultado.mjs, 3.32.0) con los
 * fotogramas reales del 1 de octubre de 2026 (franjas de arriba a 320 px,
 * con lo de debajo de la cabecera tapado): la tabla de una derrota, la de
 * estadísticas y las dos de rango.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';
import { esTabla, reconocerResultado, aprenderResultado, plantillasIniciales, cargarResultados, guardarResultados, vectorPalabra, parecidoMaximo, RESULTADO_MINIMO, TABLA_MINIMA, DESPLAZAMIENTO } from '../../scripts/lector/resultado.mjs';

const franja = (n) => leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/finales', `${n}.png`)));
const derrota = franja('tabla-derrota'), otras = { estadisticas: franja('estadisticas'), rangoVictoria: franja('rango-victoria'), rangoDerrota: franja('rango-derrota') };
const serie = plantillasIniciales(leerPng(readFileSync(join(RAIZ, 'scripts/lector/tabla-derrota.png'))));

/** La franja desplazada (dx, dy) píxeles, rellenando con negro. */
const desplazada = (t, dx, dy) => { const rgba = new Uint8Array(t.rgba.length); for (let y = 0; y < t.alto; y++) for (let x = 0; x < t.ancho; x++) { const sx = x - dx, sy = y - dy; if (sx >= 0 && sy >= 0 && sx < t.ancho && sy < t.alto) rgba.set(t.rgba.subarray((sy * t.ancho + sx) * 4, (sy * t.ancho + sx) * 4 + 4), (y * t.ancho + x) * 4); } return { ...t, rgba }; };

test('la tabla de resultado se distingue por su cabecera de las otras pantallas del final', () => {
  ok(esTabla(derrota, serie), 'la tabla de la derrota no pasa por tabla');
  for (const [n, t] of Object.entries(otras)) ok(!esTabla(t, serie), `${n} pasa por la tabla de resultado (${reconocerResultado(t, serie).parecidoTabla.toFixed(2)} ≥ ${TABLA_MINIMA})`);
  ok(esTabla(desplazada(derrota, 2, 1), serie), 'la tabla desplazada 2 px no se reconoce');
});

test('«DEFEAT» se lee de serie, también desplazada, y nunca en una pantalla que no es la tabla', () => {
  const r = reconocerResultado(derrota, serie);
  ok(r.resultado === 'perdi' && r.parecido >= RESULTADO_MINIMO, `la derrota de serie no se lee: ${JSON.stringify(r)}`);
  for (const [dx, dy] of [[DESPLAZAMIENTO, 0], [-DESPLAZAMIENTO, DESPLAZAMIENTO], [1, -1]]) eq(reconocerResultado(desplazada(derrota, dx, dy), serie).resultado, 'perdi', `desplazada (${dx}, ${dy}) no se lee`);
  for (const [n, t] of Object.entries(otras)) eq(reconocerResultado(t, serie).resultado, null, `${n} da un resultado`);
  // Sin plantilla de victoria, una tabla que no sea «DEFEAT» no se inventa nada: la zona de la palabra tapada deja de parecerse.
  const tapada = { ...derrota, rgba: new Uint8Array(derrota.rgba) };
  for (let y = Math.round(derrota.alto * 0.11); y < Math.round(derrota.alto * 0.43); y++) for (let x = Math.round(derrota.ancho * 0.35); x < Math.round(derrota.ancho * 0.65); x++) tapada.rgba.set([30, 40, 90, 255], (y * derrota.ancho + x) * 4);
  const t = reconocerResultado(tapada, serie);
  ok(t.tabla && t.resultado === null, `con la palabra tapada sigue siendo tabla (${t.tabla}) pero no debe dar resultado: ${t.resultado} (${t.parecido.toFixed(2)})`);
  // Con la MISMA palabra como plantilla de las dos (dos contestaciones contrarias sin corregir) no se decide: hace falta margen.
  const empate = { ...serie, gane: [{ v: vectorPalabra(derrota), de: 'x' }] };
  const e = reconocerResultado(derrota, empate);
  ok(e.resultado === null && e.parecido >= RESULTADO_MINIMO, `con las dos plantillas iguales decide: ${JSON.stringify(e)}`);
  // Sin plantillas de ninguna clase no hay tabla ni resultado.
  eq(reconocerResultado(derrota, { gane: [], perdi: [], tablas: [] }).resultado, null, 'sin plantillas inventa un resultado');
});

test('aprende de lo que contesta Javi: solo de la tabla, quita lo que se contradiga, y lo guardado se carga igual', () => {
  // La pantalla de rango de una victoria NO se aprende como victoria: no es la tabla (de ahí saldría «perdida» la siguiente).
  const r1 = aprenderResultado(otras.rangoVictoria, true, serie, { id: 'fotograma-a' });
  ok(!r1.aprendido && r1.motivo === 'noEsTabla' && r1.resultados.gane.length === 0, `aprende de una pantalla que no es la tabla: ${JSON.stringify({ aprendido: r1.aprendido, gane: r1.resultados.gane.length })}`);
  // La tabla de la derrota contestada como derrota: una plantilla más, y la de serie sigue.
  const r2 = aprenderResultado(desplazada(derrota, 1, 0), false, serie, { id: 'fotograma-b' });
  ok(r2.aprendido && r2.resultados.perdi.length === 2 && r2.contradichas === 0 && r2.resultados.tablas.length === 2, `no aprende la derrota: ${JSON.stringify({ a: r2.aprendido, n: r2.resultados.perdi.length })}`);
  // La MISMA tabla contestada como victoria contradice a la plantilla de serie: se quita, y la palabra pasa a victoria.
  const r3 = aprenderResultado(derrota, true, serie, { id: 'fotograma-c' });
  ok(r3.aprendido && r3.contradichas === 1 && r3.resultados.perdi.length === 0 && r3.resultados.gane.length === 1, `una contestación contraria no quita la plantilla equivocada: ${JSON.stringify({ c: r3.contradichas, p: r3.resultados.perdi.length, g: r3.resultados.gane.length })}`);
  eq(reconocerResultado(derrota, r3.resultados).resultado, 'gane', 'tras corregir, la tabla no se lee con la verdad nueva');
  // Guardar y cargar da los mismos vectores.
  const ida = cargarResultados(JSON.parse(JSON.stringify(guardarResultados(r2.resultados))));
  ok(ida.perdi.length === 2 && Math.abs(parecidoMaximo(derrota, ida.perdi[1].v, vectorPalabra) - parecidoMaximo(derrota, r2.resultados.perdi[1].v, vectorPalabra)) < 1e-5, 'lo guardado no se carga igual');
  ok(cargarResultados(null).tablas.length === 0 && cargarResultados({ gane: [{ v: 7 }] }).gane.length === 0, 'una entrada rota se cuela al cargar');
});

await terminar('scripts/resultado');

/**
 * Aprender de las correcciones (scripts/lector/aprender.mjs, 3.27.0): con
 * la captura real de Javi y la columna de picks movida de sitio (como en
 * otra tablet o en otra versión del juego) el lector no lee a nadie; con la
 * verdad que manda la app encuentra a Clint y a Khufra, aprende dónde caen
 * los huecos y los lee. Y lo que no está en la pantalla no se aprende.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';
import { leerPicksEnemigos, carasGuardadas, PICKS_ENEMIGOS } from '../../scripts/lector/leer.mjs';
import { aprenderDe, ajustarPosiciones, carasAprendidas, resumirAprendizaje, esPantallaDeDraft, huecoDe, APRENDER_MINIMO, VERSION_APRENDIDO } from '../../scripts/lector/aprender.mjs';
import { capturaCompleta, capturaCompletaPng, VERDAD } from '../fixtures/juego/captura.mjs';
import { aprenderEnHilo } from '../../scripts/lector/servir.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** La captura con la columna de picks enemigos desplazada (dx, dy) píxeles; `sinBaneos`: sin la fila de arriba (como la carga o la partida). */
function conPicksEn(dx, dy, { sinBaneos = false } = {}) {
  const g = sinBaneos ? { ancho: 2400, alto: 1504, rgba: new Uint8Array(2400 * 1504 * 4) } : capturaCompleta({ conPicks: false });
  const col = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/picks-enemigos.png')));
  for (let y = 0; y < col.alto; y++) {
    const yy = y + 230 + dy;
    if (yy < 0 || yy >= g.alto) continue;
    g.rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), (yy * g.ancho + 2020 + dx) * 4);
  }
  return g;
}
const caras = carasGuardadas();
const nombres = (l) => l.map((p) => p.nombre ?? '?').join(',');

test('con los huecos en otro sitio no lee a nadie; con la verdad de la app aprende dónde están y los lee', () => {
  const img = conPicksEn(-60, 90);
  eq(nombres(leerPicksEnemigos(img, caras)), '?,?,?,?,?', 'con la columna movida 60×90 px el lector sigue leyendo: la prueba no mide nada');
  const r = aprenderDe([{ id: 'lectura-prueba-1', img, verdad: { enemigos: ['Clint', 'Khufra', 'Layla'] } }], { caras });
  const a = r.aprendido;
  ok(a.picks, 'no aprende las posiciones de los huecos');
  ok(Math.abs(a.picks[0][0] - (PICKS_ENEMIGOS[0][0] - 60)) < 20 && Math.abs(a.picks[0][1] - (PICKS_ENEMIGOS[0][1] + 90)) < 20, `el primer hueco aprendido está en ${a.picks[0]} y debía estar cerca de ${[PICKS_ENEMIGOS[0][0] - 60, PICKS_ENEMIGOS[0][1] + 90]}`);
  const paso = a.picks[1][1] - a.picks[0][1], pasoAntes = PICKS_ENEMIGOS[1][1] - PICKS_ENEMIGOS[0][1];
  ok(Math.abs(paso - pasoAntes) < pasoAntes * 0.11, `el espacio entre huecos cambia de ${pasoAntes} a ${paso}`);
  ok(a.caras.Clint?.length === 1, 'no guarda la cara de Clint tal como la pinta el panel');
  ok(!a.caras.Layla, 'aprende una cara de Layla, que no está en la pantalla');
  const despues = leerPicksEnemigos(img, caras, { posiciones: a.picks, extra: carasAprendidas(a) });
  eq(nombres(despues), 'Clint,Khufra,?,?,?', `tras aprender lee ${nombres(despues)}`);
  const informe = r.informe[0];
  ok(informe.sinEncontrar.some((x) => x.nombre === 'Layla'), 'no dice que a Layla no la encuentra');
  ok(resumirAprendizaje(r).some((l) => /No encuentro a Layla/.test(l)), 'el resumen no pide la captura de Layla');
  // Lo aprendido se acumula: una segunda tanda con la captura en su sitio no borra lo de antes.
  const r2 = aprenderDe([{ id: 'lectura-prueba-2', img: conPicksEn(0, 0), verdad: { enemigos: ['Clint'] } }], { caras, aprendido: a });
  ok(r2.aprendido.caras.Clint?.length >= 1 && r2.aprendido.capturas === 2, 'una tanda nueva pierde lo aprendido antes');
});

test('una cara aprendida del panel lee al héroe aunque la cara de la API ya no sirva (como un rework)', () => {
  // Se aprende Clint del panel; después se lee con unas caras de la API en
  // las que Clint es OTRA cara (la de Layla): solo la aprendida puede leerlo.
  const img = conPicksEn(0, 0);
  const a = aprenderDe([{ id: 'lectura-prueba-4', img: conPicksEn(-60, 90), verdad: { enemigos: ['Clint'] } }], { caras }).aprendido;
  ok(a.caras.Clint, 'no aprende la cara de Clint: la prueba no mide nada');
  const layla = caras.find((c) => c.nombre === 'Layla');
  const sinClint = caras.map((c) => (c.nombre === 'Clint' ? { nombre: 'Clint', v: layla.v } : c));
  eq(nombres(leerPicksEnemigos(img, sinClint)), '?,Khufra,?,?,?', 'con la cara de la API cambiada el lector sigue leyendo a Clint: la prueba no mide nada');
  eq(nombres(leerPicksEnemigos(img, sinClint, { extra: carasAprendidas(a) })), 'Clint,Khufra,?,?,?', 'la cara aprendida del panel no lee a Clint');
});

test('no aprende lo dudoso: el umbral deja fuera el mejor equivocado medido, y un hueco con otro héroe igual de parecido no cuenta', () => {
  ok(APRENDER_MINIMO > 0.72, 'el umbral de aprender está por debajo del peor equivocado medido (0,72)');
  // Un héroe que no está: lo más parecido en el panel queda lejos del umbral.
  const r = aprenderDe([{ id: 'lectura-prueba-3', img: conPicksEn(0, 0), verdad: { enemigos: ['Miya', 'Layla', 'Eudora'] } }], { caras });
  eq(Object.keys(r.aprendido.caras).length, 0, `aprende caras de héroes que no están: ${Object.keys(r.aprendido.caras)}`);
  ok(r.informe[0].sinEncontrar.every((x) => x.parecido < APRENDER_MINIMO), 'lo que no está se parece más que el umbral: el umbral no protege');
});

test('las posiciones se desplazan en bloque y conservan el espacio entre huecos', () => {
  const antes = [[100, 100, 10], [100, 200, 10], [100, 300, 10], [100, 400, 10], [100, 500, 10]];
  // Dos hallazgos en huecos vecinos con 20 px de error entre ellos: una recta daría 80 px de error en el quinto.
  const dos = ajustarPosiciones(antes, [{ hueco: 0, pos: [90, 130, 11] }, { hueco: 1, pos: [90, 250, 11] }]);
  eq(dos[4][1] - dos[3][1], 100, 'con dos hallazgos cambia el espacio entre huecos');
  ok(Math.abs(dos[0][1] - 140) < 1 && dos[0][0] === 90 && dos[0][2] === 11, `el desplazamiento no es la mediana: ${dos[0]}`);
  // Con tres huecos, el espacio se reajusta pero acotado al ±10%.
  const tres = ajustarPosiciones(antes, [{ hueco: 0, pos: [100, 100, 10] }, { hueco: 2, pos: [100, 340, 10] }, { hueco: 4, pos: [100, 580, 10] }]);
  ok(Math.abs((tres[1][1] - tres[0][1]) - 110) < 0.01, `el espacio con tres hallazgos a 120 no se acota a 110: ${tres[1][1] - tres[0][1]}`);
  eq(ajustarPosiciones(antes, []), antes, 'sin hallazgos cambia las posiciones');
});

test('el aprendizaje de verdad corre en un hilo aparte y devuelve lo mismo que en el principal', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'aprender-hilo-'));
  const ruta = join(carpeta, 'lectura-hilo-1.png');
  writeFileSync(ruta, capturaCompletaPng());
  const r = await aprenderEnHilo({ pares: [{ id: 'lectura-hilo-1', png: ruta, verdad: { enemigos: ['Clint', 'Khufra', 'Layla'] } }], aprendido: null });
  eq(r.aprendido.capturas, 1, 'el hilo no aprende de la captura');
  ok(r.informe[0].yaLeidos.length === 2 && r.informe[0].sinEncontrar.some((x) => x.nombre === 'Layla'), `el informe del hilo no es el esperado: ${JSON.stringify(r.informe)}`);
});

test('la geometría medida manda: unos huecos aprendidos equivocados no tapan lo que la medida lee (3.30.1)', () => {
  // El 1 de octubre de 2026 una tanda aprendió unos huecos desplazados y los picks dejaron de leerse toda la tarde.
  const img = conPicksEn(0, 0);
  const equivocados = PICKS_ENEMIGOS.map(([x, y, r]) => [x, y - 230, r]);
  eq(nombres(leerPicksEnemigos(img, caras, { posiciones: equivocados })), 'Clint,Khufra,?,?,?', 'con unos huecos aprendidos equivocados la lectura pierde a Clint y a Khufra');
  // Y donde la medida no lee, el aprendido sí entra (es lo que aprende la primera prueba).
  const movida = conPicksEn(-60, 90);
  const buenos = PICKS_ENEMIGOS.map(([x, y, r]) => [x - 60, y + 90, r]);
  eq(nombres(leerPicksEnemigos(movida, caras, { posiciones: buenos })), 'Clint,Khufra,?,?,?', 'con la columna movida no entra el hueco aprendido');
});

test('no aprende de una captura que no es la pantalla del draft (sin su fila de baneos) ni de un hallazgo fuera de los huecos (3.30.1)', () => {
  const baneos = [...VERDAD.tuyos, ...VERDAD.suyos];
  const draft = conPicksEn(-60, 90), carga = conPicksEn(-60, 90, { sinBaneos: true });
  ok(esPantallaDeDraft(draft, caras, { baneos }) && !esPantallaDeDraft(carga, caras, { baneos }), 'no distingue la pantalla del draft de una sin baneos');
  ok(esPantallaDeDraft(carga, caras, { baneos: [] }), 'sin baneos en la verdad (una clásica) descarta la captura');
  // Las tres últimas no son el draft: se aprende de la que sí lo es, aunque sea anterior.
  const verdad = { enemigos: ['Clint', 'Khufra'], baneos };
  const pares = [{ id: 'lectura-d-1', img: draft, verdad }, ...[2, 3, 4].map((i) => ({ id: `lectura-d-${i}`, img: carga, verdad }))];
  const r = aprenderDe(pares, { caras });
  eq(r.informe.filter((l) => l.descartada === 'sinBaneos').map((l) => l.id).join(), 'lectura-d-2,lectura-d-3,lectura-d-4', `no descarta las capturas sin baneos: ${JSON.stringify(r.informe.map((l) => [l.id, l.descartada]))}`);
  eq(r.aprendido.capturas, 1, 'cuenta como aprendidas las capturas descartadas');
  ok(r.aprendido.picks && Math.abs(r.aprendido.picks[0][1] - (PICKS_ENEMIGOS[0][1] + 90)) < 20, 'no aprende de la captura buena que había antes de las descartadas');
  ok(resumirAprendizaje(r).some((l) => /lectura-d-4 no es la pantalla del draft/.test(l)), 'el resumen no dice qué capturas se descartaron');
  // Un hallazgo lejos de todo hueco (la columna subida 135 px: Clint cae entre la fila de baneos y el primer hueco) no mueve el panel.
  const subida = conPicksEn(0, -135);
  const r2 = aprenderDe([{ id: 'lectura-f-1', img: subida, verdad: { enemigos: ['Clint'] } }], { caras });
  ok(r2.informe[0].sinEncontrar.some((x) => x.nombre === 'Clint' && x.fuera), `Clint fuera de los huecos se aprende igual: ${JSON.stringify(r2.informe[0])}`);
  eq(r2.aprendido.picks, null, `un hallazgo fuera de los huecos mueve el panel: ${JSON.stringify(r2.aprendido.picks)}`);
  ok(resumirAprendizaje(r2).some((l) => /Clint se parece .* fuera de los huecos de picks/.test(l)), 'el resumen no dice que el hallazgo cae fuera');
  // El hueco de un hallazgo: a menos de medio hueco en y y de medio ancho en x; si no, −1.
  const [x0, y0, r0] = PICKS_ENEMIGOS[0], paso = PICKS_ENEMIGOS[1][1] - y0;
  eq(huecoDe([x0, y0 + 90, r0]), 0, 'un hallazgo a 90 px del primer hueco no es suyo');
  eq(huecoDe([x0, y0 + paso - 66, r0]), 1, 'un hallazgo a 66 px del segundo hueco no es suyo');
  eq(huecoDe([x0, y0 - 230, r0]), -1, 'un hallazgo en la fila de baneos cae en un hueco');
  eq(huecoDe([x0 + 191, y0, r0]), -1, 'un hallazgo fuera del ancho del panel cae en un hueco');
  eq(r.aprendido.version, VERSION_APRENDIDO, 'lo aprendido no lleva la versión actual');
});

await terminar('scripts/aprender');

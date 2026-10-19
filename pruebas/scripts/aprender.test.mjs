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
import { leerPicksEnemigos, leerAliados, carasGuardadas, PICKS_ENEMIGOS, ALIADO_MINIMO } from '../../scripts/lector/leer.mjs';
import { leerCaptura } from '../../scripts/lector/lectura.mjs';
import { muestra as muestraDe } from '../../scripts/lector/caras.mjs';
import { ALIADOS as ALIADOS_REF } from '../../scripts/lector/leer.mjs';
import { aprenderDe, ajustarPosiciones, carasAprendidas, aliadasAprendidas, etiquetarAliados, momentoDe, esHuecoVacio, VACIO_ALIADO, resumirAprendizaje, esPantallaDeDraft, huecoDe, APRENDER_MINIMO, VERSION_APRENDIDO, MINUTOS_ENTRE_DRAFTS } from '../../scripts/lector/aprender.mjs';
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

test('aprende de las capturas que MÁS enemigos leen, no de las últimas (que suelen ser ya la fase de skins) (3.54.0)', () => {
  // Una captura con el panel de picks y, después, dos sin él (como la fase de skins: la fila de baneos sigue).
  const verdad = { enemigos: ['Clint', 'Khufra'], baneos: [...VERDAD.tuyos, ...VERDAD.suyos] };
  const pares = [
    { id: 'lectura-picks', img: capturaCompleta(), verdad },
    { id: 'lectura-skins-1', img: capturaCompleta({ conPicks: false }), verdad },
    { id: 'lectura-skins-2', img: capturaCompleta({ conPicks: false }), verdad },
  ];
  const r = aprenderDe(pares, { caras, maximo: 1 });
  const miradas = r.informe.filter((l) => !l.descartada);
  eq(miradas.map((l) => l.id).join(), 'lectura-picks', `mira ${miradas.map((l) => l.id)}`);
  eq(miradas[0].aciertos, 2, 'no apunta cuántos enemigos leía');
  // A igualdad, la más nueva.
  const r2 = aprenderDe(pares.slice(1), { caras, maximo: 1 });
  eq(r2.informe.filter((l) => !l.descartada).map((l) => l.id).join(), 'lectura-skins-2');
});

// Tu equipo (3.58.0). En la captura de prueba la API lee a los cinco; para
// imitar una skin que no se parece a la cara de la API, se le cambia a un
// héroe su cara por la de otro (como en la prueba del rework).
const sinCara = (...quienes) => caras.map((c) => (quienes.includes(c.nombre) ? { ...c, v: caras.find((x) => x.nombre === 'Layla').v } : c));
/** El recorte (sin normalizar) del hueco `fila` de tu equipo, como lo guarda el aprendizaje. */
const leerVacio = (img, fila = 1) => muestraDe(img, ...ALIADOS_REF[fila]);
const VERDAD_EQUIPO = { enemigos: VERDAD.enemigos2, baneos: [...VERDAD.tuyos, ...VERDAD.suyos], aliados: VERDAD.aliados.filter((n) => n !== VERDAD.tuyo), tuyo: VERDAD.tuyo };
const idA = (min) => `lectura-${new Date(Date.UTC(2026, 9, 14, 17, 0) + min * 60000).toISOString().replace(/[:.]/g, '-')}-1`;
const filas = (l) => l.map((x) => x.nombre ?? '?').join(',');

test('tu equipo: aprende la cara de un compañero que la API no lee, y solo la usa cuando dos drafts distintos la confirman (3.58.0)', () => {
  const sinGuinevere = sinCara('Guinevere');
  const img = capturaCompleta({ columna: 2 });
  eq(filas(leerAliados(img, sinGuinevere)), 'Clint,?,Novaria,Leomord,Estes', 'sin su cara la API sigue leyendo a Guinevere: la prueba no mide nada');
  eq(momentoDe(idA(0)), Date.UTC(2026, 9, 14, 17, 0), `el instante de ${idA(0)} sale mal`);
  // Primer draft: tres compañeros leídos, el que queda es Guinevere. Queda pendiente, no se usa.
  const r1 = aprenderDe([{ id: idA(0), img, verdad: VERDAD_EQUIPO }], { caras: sinGuinevere });
  eq(r1.informe[0].aliados?.pendientes.join(), 'Guinevere', `del primer draft no queda pendiente Guinevere: ${JSON.stringify(r1.informe[0].aliados)}`);
  eq(Object.keys(r1.aprendido.aliados).length, 0, 'una cara vista en un solo draft ya se usa');
  // Otra captura del MISMO draft (cinco minutos después) no la confirma, ni la misma captura corregida otra vez.
  const r2 = aprenderDe([{ id: idA(5), img, verdad: VERDAD_EQUIPO }], { caras: sinGuinevere, aprendido: r1.aprendido });
  const r2b = aprenderDe([{ id: idA(0), img, verdad: VERDAD_EQUIPO }], { caras: sinGuinevere, aprendido: r1.aprendido });
  ok(!r2.aprendido.aliados.Guinevere && !r2b.aprendido.aliados.Guinevere, 'dos capturas del mismo draft confirman la cara');
  eq(r2b.aprendido.aliadosPendientes.Guinevere.length, 1, 'la misma captura corregida dos veces se apunta dos veces');
  // Otro draft, más de MINUTOS_ENTRE_DRAFTS después: confirmada, y la lectura la usa.
  const r3 = aprenderDe([{ id: idA(MINUTOS_ENTRE_DRAFTS + 1), img, verdad: VERDAD_EQUIPO }], { caras: sinGuinevere, aprendido: r2.aprendido });
  eq(r3.informe[0].aliados?.aprendidos.join(), 'Guinevere', `el segundo draft no la confirma: ${JSON.stringify(r3.informe[0].aliados)}`);
  ok(!(r3.aprendido.aliadosPendientes.Guinevere ?? []).some((p) => r3.aprendido.aliados.Guinevere.some((c) => c.de === p.de)), 'confirmada, sigue pendiente');
  const despues = leerAliados(img, sinGuinevere, { extra: aliadasAprendidas(r3.aprendido) });
  eq(filas(despues), 'Clint,Guinevere,Novaria,Leomord,Estes', `con la cara aprendida lee ${filas(despues)}`);
  ok(despues[1].aprendida && despues[1].parecido >= ALIADO_MINIMO, 'la lectura no marca que sale de una cara aprendida');
  ok(resumirAprendizaje(r3).some((l) => /Aprendido en tu equipo: Guinevere/.test(l)), 'el resumen no lo dice');
  // Y la lectura entera del lector (la de /leer) la usa.
  const entera = leerCaptura(img, sinGuinevere, r3.aprendido);
  eq(entera.aliados[1].nombre, 'Guinevere', `la lectura de /leer no usa lo aprendido de tu equipo: ${filas(entera.aliados)}`);
});

test('tu equipo: tu fila es tu pick; con dos compañeros sin leer no adivina; y lo aprendido no lee a quien no es (3.58.0)', () => {
  const img = capturaCompleta({ columna: 2 });
  // Tu fila (la amarilla) es tu pick aunque la API no lo lea.
  const sinEstes = sinCara('Estes');
  let a = null;
  for (const min of [0, 30]) a = aprenderDe([{ id: idA(min), img, verdad: { ...VERDAD_EQUIPO, aliados: [] } }], { caras: sinEstes, aprendido: a }).aprendido;
  ok(a.aliados.Estes, `no aprende tu pick en tu fila: ${JSON.stringify(Object.keys(a.aliados))}`);
  eq(leerAliados(img, sinEstes, { extra: aliadasAprendidas(a) })[4].nombre, 'Estes', 'no lee tu pick con lo aprendido');
  // Sin saber cuál es tu fila no se etiqueta nada (uno de ellos serías tú).
  const sinFila = capturaCompleta({ columna: 2, filaAmarilla: -1 });
  let b = null;
  for (const min of [0, 30]) b = aprenderDe([{ id: idA(min), img: sinFila, verdad: VERDAD_EQUIPO }], { caras: sinEstes, aprendido: b }).aprendido;
  eq(Object.keys(b.aliados).length + Object.keys(b.aliadosPendientes).length, 0, 'sin tu fila aprende caras de tu equipo');
  // Dos compañeros sin leer: no se sabe quién es quién.
  const sinDos = sinCara('Guinevere', 'Novaria');
  const leidos = leerAliados(img, sinDos);
  eq(etiquetarAliados(leidos, 4, { aliados: VERDAD_EQUIPO.aliados }).length, 0, 'con dos compañeros sin leer etiqueta a uno');
  eq(etiquetarAliados(leidos, 4, { aliados: VERDAD_EQUIPO.aliados, tuyo: 'Estes' }).length, 0, 'etiqueta tu fila cuando ya se lee tu pick');
  eq(etiquetarAliados(leidos, -1, { aliados: VERDAD_EQUIPO.aliados, tuyo: 'Estes' }).length, 0, 'sin tu fila etiqueta algo');
  // La cara aprendida de Guinevere no lee a Clint (otro héroe sin cara de la API) ni se repite en dos huecos.
  const sinGuinevere = sinCara('Guinevere');
  let g = null;
  for (const min of [0, 30]) g = aprenderDe([{ id: idA(min), img, verdad: VERDAD_EQUIPO }], { caras: sinGuinevere, aprendido: g }).aprendido;
  ok(g.aliados.Guinevere, 'no aprende a Guinevere: el resto de la prueba no mide nada');
  const otra = leerAliados(img, sinCara('Guinevere', 'Clint'), { extra: aliadasAprendidas(g) });
  eq(filas(otra), '?,Guinevere,Novaria,Leomord,Estes', `la cara de Guinevere lee a otro: ${filas(otra)}`);
  // Un nombre que ya se lee en otro hueco no se repite: una cara aprendida de Guinevere apuntada como Clint no lee el hueco de Guinevere.
  const comoClint = aliadasAprendidas(g).map((c) => ({ ...c, nombre: 'Clint' }));
  eq(filas(leerAliados(img, sinGuinevere, { extra: comoClint })), 'Clint,?,Novaria,Leomord,Estes', 'lo aprendido lee en dos huecos al mismo héroe');
  // La API manda: con su cara en su sitio no se lee por la aprendida.
  // (con la cara aprendida apuntada como otro héroe que no está, Layla: si mandara, el hueco de Guinevere saldría Layla)
  const comoLayla = aliadasAprendidas(g).map((c) => ({ ...c, nombre: 'Layla' }));
  eq(leerAliados(img, caras, { extra: comoLayla })[1].nombre, 'Guinevere', 'lo aprendido tapa lo que la API lee');
});

test('tu equipo: no aprende de una captura de otra partida ni con pocos enemigos leídos (3.58.0)', () => {
  const img = capturaCompleta({ columna: 2 });
  const sinGuinevere = sinCara('Guinevere');
  // Un enemigo leído que no está en la verdad: es otra partida (#93) o la fase de skins.
  const otra = { ...VERDAD_EQUIPO, enemigos: VERDAD.enemigos2.slice(1).concat('Layla') };
  const r = aprenderDe([{ id: idA(0), img, verdad: otra }], { caras: sinGuinevere });
  ok(!r.informe[0].aliados, `aprende tu equipo de una captura con un enemigo que no es de la verdad: ${JSON.stringify(r.informe[0].aliados)}`);
  // Con dos enemigos leídos (la columna de Clint y Khufra) tampoco.
  const r2 = aprenderDe([{ id: idA(0), img: capturaCompleta(), verdad: { ...VERDAD_EQUIPO, enemigos: VERDAD.enemigos } }], { caras: sinGuinevere });
  ok(!r2.informe[0].aliados, 'aprende tu equipo con solo dos enemigos leídos');
  // Una captura sin instante en el nombre no se puede ordenar entre drafts: no aprende.
  const r3 = aprenderDe([{ id: 'lectura-sin-hora', img, verdad: VERDAD_EQUIPO }], { caras: sinGuinevere });
  eq(Object.keys(r3.aprendido.aliadosPendientes).length, 0, 'aprende de una captura sin instante');
});

/** La captura con el hueco `fila` de tu equipo como cuando ese jugador aún no ha elegido (el icono de la mano, incidencia #60). */
function conHuecoVacio(fila, fichero = 'aliado-vacio.png') {
  const g = capturaCompleta({ columna: 2 });
  const v = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego', fichero)));
  for (let y = 0; y < v.alto; y++) g.rgba.set(v.rgba.subarray(y * v.ancho * 4, (y + 1) * v.ancho * 4), ((228 + 216 * fila + y) * g.ancho + 60) * 4);
  return g;
}

test('tu equipo: el hueco de quien aún no ha elegido no se aprende como el que falta, ni lo ya aprendido así se usa (3.58.1)', () => {
  const img = conHuecoVacio(1);
  eq(filas(leerAliados(img, caras)), 'Clint,?,Novaria,Leomord,Estes', 'con el hueco vacío la API lee a alguien: la prueba no mide nada');
  // Dos drafts en los que Guinevere elige la última: el que falta por eliminación es su hueco vacío.
  let a = null, r;
  for (const min of [0, 30]) { r = aprenderDe([{ id: idA(min), img, verdad: VERDAD_EQUIPO }], { caras, aprendido: a }); a = r.aprendido; }
  eq(Object.keys(a.aliados).length + Object.keys(a.aliadosPendientes).length, 0, `aprende el icono del hueco vacío como Guinevere: ${JSON.stringify(Object.keys(a.aliados))}`);
  eq(r.informe[0].aliados.vacios.join(), 'Guinevere', 'el informe no dice que el hueco estaba vacío');
  ok(resumirAprendizaje(r).some((l) => /aún no había elegido/.test(l)), 'el resumen no lo dice');
  // Lo que 3.58.0 ya hubiera aprendido así no se usa al leer.
  const viejo = { aliados: { Guinevere: [{ v: Buffer.from(Uint8Array.from(leerVacio(img), (x) => Math.round(x))).toString('base64') }] } };
  eq(aliadasAprendidas(viejo).length, 0, 'una cara aprendida que es el hueco vacío se usa al leer');
  ok(esHuecoVacio(VACIO_ALIADO), 'el icono no se reconoce a sí mismo');
  eq(aliadasAprendidas({ aliados: { Clint: [{ v: Buffer.from(Uint8Array.from(leerVacio(capturaCompleta({ columna: 2 }), 0), (x) => Math.round(x))).toString('base64') }] } }).length, 1, 'una cara de verdad se toma por el hueco vacío');
});

test('tu equipo: TU hueco antes de elegir (el cuadro azul, otro icono) tampoco se aprende como tu pick (3.59.5)', () => {
  // #80: tu fila (la amarilla, la quinta en la captura de prueba) con el cuadro azul; tu pick de la verdad, Estes.
  const img = conHuecoVacio(4, 'aliado-vacio-tuyo.png');
  ok(!leerAliados(img, caras)[4].nombre, 'la API lee a alguien en el cuadro azul: la prueba no mide nada');
  let a = null, r;
  for (const min of [0, 30]) { r = aprenderDe([{ id: idA(min), img, verdad: { ...VERDAD_EQUIPO, aliados: [] } }], { caras, aprendido: a }); a = r.aprendido; }
  ok(!a.aliados.Estes && !a.aliadosPendientes.Estes, `aprende el cuadro azul como Estes (pasó con #58 y #80): ${JSON.stringify(Object.keys(a.aliados))}`);
  eq(r.informe[0].aliados.vacios.join(), 'Estes', 'el informe no dice que tu hueco estaba sin elegir');
  // Y lo que 3.58 ya aprendió así en el móvil de Javi no se usa al leer.
  const viejo = { aliados: { Estes: [{ v: Buffer.from(Uint8Array.from(leerVacio(img, 4), (x) => Math.round(x))).toString('base64') }] } };
  eq(aliadasAprendidas(viejo).length, 0, 'el cuadro azul aprendido como Estes se sigue usando al leer');
});

test('tu equipo: una cara que se parece a la aprendida de OTRO héroe no se aprende (3.58.1)', () => {
  const img = capturaCompleta({ columna: 2 });
  const sinGuinevere = sinCara('Guinevere');
  let g = null;
  for (const min of [0, 30]) g = aprenderDe([{ id: idA(min), img, verdad: VERDAD_EQUIPO }], { caras: sinGuinevere, aprendido: g }).aprendido;
  ok(g.aliados.Guinevere, 'no aprende a Guinevere: la prueba no mide nada');
  // Ahora la verdad dice que en ese hueco había otro (Layla): un cambio de héroe entre compañeros o una verdad mal puesta.
  const otra = { ...VERDAD_EQUIPO, aliados: VERDAD_EQUIPO.aliados.map((n) => (n === 'Guinevere' ? 'Layla' : n)) };
  const r = aprenderDe([{ id: idA(60), img, verdad: otra }], { caras: sinGuinevere, aprendido: g });
  eq(JSON.stringify(r.informe[0].aliados.confundibles), JSON.stringify([{ nombre: 'Layla', con: 'Guinevere' }]), `no avisa de la confusión: ${JSON.stringify(r.informe[0].aliados)}`);
  ok(!r.aprendido.aliadosPendientes.Layla && !r.aprendido.aliados.Layla, 'aprende la cara de Guinevere como Layla');
});

await terminar('scripts/aprender');

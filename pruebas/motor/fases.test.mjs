/**
 * Pruebas de src/motor/fases.js (3.43.0): la probabilidad de ganar según el
 * minuto en que acaba la partida, con la curva por duración de cada héroe en
 * su línea. Propiedades, no números de un día: un equipo «medio» no tiene
 * forma, un héroe sin cuota no mueve el centro, la probabilidad sube con la
 * partida si sois de late y baja si sois de early, y no se dice nada cuando
 * no está claro.
 */
import { readFileSync } from 'node:fs';
import { test, ok, eq, casi, terminar, RAIZ } from '../arnes.mjs';
import {
  TRAMOS, COEF_FASE, DIFERENCIA_DE_FASE, PENDIENTE_DE_HEROE,
  formaDe, curvaDe, centroDeFases, formaDeEquipo, probabilidadPorTramo, fasesDePartida,
} from '../../src/motor/fases.js';
import { indexarPorNombre, nombreClave, buscar } from '../../src/motor/nombres.js';
import { lineasOcupadas } from '../../src/motor/lineas.js';
import { prepararDatos, planear, ordenar } from '../../src/motor/draft.js';
import { logit } from '../../src/motor/modelo.js';

const plana = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
const deEarly = [0.58, 0.55, 0.52, 0.49, 0.46, 0.43];
const deLate = [0.42, 0.45, 0.48, 0.51, 0.54, 0.57];
const H = (name) => ({ name });

test('la forma de una curva es su logit menos el de su total; una curva rota no tiene forma', () => {
  const f = formaDe(deEarly, 0.5);
  casi(f[0], logit(0.58), 1e-12, 'el primer tramo no es logit(wr) − logit(total)');
  ok(f[0] > 0 && f[5] < 0, 'una curva de early no baja');
  // Sin total, centrada en su propia media: suma cero.
  casi(formaDe(deLate).reduce((a, b) => a + b, 0), 0, 1e-12, 'sin total no se centra en su media');
  eq(formaDe([0.5, 0.5]), null, 'una curva con otros tramos tiene forma');
  eq(formaDe([0.5, 0.5, 0.5, 0.5, 0.5, 1.2]), null, 'una curva con un winrate imposible tiene forma');
  eq(TRAMOS.length, 6, 'los tramos no son los seis de la API');
});

test('la curva de un héroe: la de su línea, la de otra si no juega esa, y por nombre normalizado', () => {
  const curvas = indexarPorNombre({ 'X.Borg': { exp: deLate, jungle: deEarly } });
  eq(curvaDe(curvas, H('X Borg'), 'jungle')?.curva, deEarly, '«X Borg» no encuentra la curva de «X.Borg»');
  eq(curvaDe(curvas, H('X Borg'), 'roam')?.linea, 'exp', 'sin curva en esa línea no usa la de otra');
  eq(curvaDe(curvas, H('Nadie'), 'roam'), null, 'un héroe sin curva tiene curva');
});

test('el centro: la forma media de lo que sale, ponderada por cuota; un héroe sin cuota no lo mueve', () => {
  const curvas = { A: { roam: deEarly }, B: { roam: deLate } };
  const stats = indexarPorNombre({ A: { pickRate: 0.03 }, B: { pickRate: 0.01 } });
  const c = centroDeFases(curvas, {}, stats);
  ok(c[0] > 0 && c[5] < 0, `el centro no pesa más al héroe más jugado: ${c}`);
  const conCero = centroDeFases({ ...curvas, Z: { roam: [0.7, 0.6, 0.5, 0.4, 0.35, 0.3] } }, {}, stats);
  casi(conCero[0], c[0], 1e-12, 'un héroe sin estadísticas mueve el centro (un «no sé» que pesa 1)');
  // Un equipo hecho del centro no tiene forma.
  const equipo = formaDeEquipo([{ heroe: H('A'), linea: 'roam' }], { curvaLinea: indexarPorNombre(curvas), winrateLinea: {}, centro: formaDe(deEarly) });
  ok(equipo.forma.every((v) => Math.abs(v) < 1e-12), `un héroe igual que el centro tiene forma: ${equipo.forma}`);
});

test('la probabilidad por tramo: la nota de siempre si las formas se cancelan; sube con la partida si sois de late', () => {
  const iguales = probabilidadPorTramo(0.55, [0.1, 0, 0, 0, 0, -0.1], [0.1, 0, 0, 0, 0, -0.1]);
  ok(iguales.every((x) => Math.abs(x.p - 0.55) < 1e-12), 'con la misma forma los dos equipos no sale la nota de siempre');
  const late = probabilidadPorTramo(0.5, formaDe(deLate), formaDe(plana));
  ok(late[5].p > late[0].p, 'el equipo de late no gana más en la partida larga');
  // Con el coeficiente medido, no con 1.
  casi(logit(late[5].p), COEF_FASE * formaDe(deLate)[5], 1e-9, 'la forma no entra con el coeficiente medido');
  eq(late[5].hasta, null, 'el último tramo no es «20 o más»');
});

test('fases: tendencia solo por encima del umbral, el cambio de lado solo con tendencia, y nombra a quien empuja', () => {
  const curvaLinea = indexarPorNombre({ Temprano: { roam: deEarly }, Tardio: { gold: deLate }, Plano: { roam: plana, gold: plana } });
  const df = { curvaLinea, winrateLinea: {}, centro: [0, 0, 0, 0, 0, 0] };
  const late = fasesDePartida({ pBase: 0.5, nos: [{ heroe: H('Tardio'), linea: 'gold' }], ellos: [{ heroe: H('Temprano'), linea: 'roam' }], datosFases: df });
  eq(late.tendencia, 'tarde', `dos curvas opuestas no dan tendencia: ${JSON.stringify(late.puntos.map((x) => x.p))}`);
  ok(late.puntos[5].p - late.puntos[0].p >= DIFERENCIA_DE_FASE, 'la tendencia salta por debajo del umbral');
  eq(late.cambio?.aFavor, true, 'con 50% de base, la partida no cambia de lado a favor');
  eq(late.nos.tarde?.heroe.name, 'Tardio', 'no nombra a vuestro héroe de late');
  eq(late.ellos.pronto?.heroe.name, 'Temprano', 'no nombra a su héroe de early');
  ok(late.nos.tarde.pendiente >= PENDIENTE_DE_HEROE, 'nombra a un héroe por debajo del umbral');
  const igual = fasesDePartida({ pBase: 0.5, nos: [{ heroe: H('Plano'), linea: 'roam' }], ellos: [{ heroe: H('Plano'), linea: 'gold' }], datosFases: df });
  eq(igual.tendencia, 'igual', 'dos equipos planos tienen tendencia');
  eq(igual.cambio, null, 'sin tendencia dice que la partida cambia de lado');
  // Cruzar el 50% por poco, sin tendencia, no es «cambiar de lado».
  const pocoLate = indexarPorNombre({ Leve: { roam: [0.495, 0.497, 0.499, 0.501, 0.503, 0.505] } });
  const roza = fasesDePartida({ pBase: 0.5, nos: [{ heroe: H('Leve'), linea: 'roam' }], ellos: [], datosFases: { curvaLinea: pocoLate, winrateLinea: {}, centro: [0, 0, 0, 0, 0, 0] } });
  ok(roza.puntos[0].p < 0.5 && roza.puntos[5].p > 0.5 && roza.tendencia === 'igual', `el caso no cruza el 50% sin tendencia: ${JSON.stringify(roza.puntos.map((x) => x.p))}`);
  eq(roza.cambio, null, 'cruzar el 50% por poco y sin tendencia se dice como un cambio de lado');
  eq(igual.nos.tarde, null, 'un héroe plano sale como de late');
  // El ÚLTIMO cruce del 50%, en el sentido de la tendencia (3.43.2): con la
  // curva bajando y volviendo a subir, el primero decía lo contrario de las
  // barras. Aquí 52 → 48 → … → 69: a favor desde el 14, no «en contra desde el 12».
  const vuelta = indexarPorNombre({ V: { roam: [0.52, 0.48, 0.51, 0.57, 0.62, 0.69] } });
  const fv = fasesDePartida({ pBase: 0.5, nos: [{ heroe: H('V'), linea: 'roam' }], ellos: [], datosFases: { curvaLinea: vuelta, winrateLinea: { v: { roam: 0.5 } }, centro: [0, 0, 0, 0, 0, 0] } });
  ok(fv.puntos[1].p < 0.5 && fv.puntos[2].p > 0.5 && fv.tendencia === 'tarde', `el caso no baja y vuelve a subir: ${JSON.stringify(fv.puntos.map((x) => x.p))}`);
  eq(JSON.stringify(fv.cambio), JSON.stringify({ minuto: 14, aFavor: true }), 'con varios cruces del 50% se queda el primero');
  // Y si el último cruce va contra la tendencia (35 43 57 65 57 48: de late,
  // pero por detrás otra vez pasado el 20), no se dice ningún minuto.
  const contra = indexarPorNombre({ C: { roam: [0.3, 0.4, 0.6, 0.7, 0.6, 0.47] } });
  const fc = fasesDePartida({ pBase: 0.5, nos: [{ heroe: H('C'), linea: 'roam' }], ellos: [], datosFases: { curvaLinea: contra, winrateLinea: { c: { roam: 0.5 } }, centro: [0, 0, 0, 0, 0, 0] } });
  ok(fc.tendencia === 'tarde' && fc.puntos[5].p < 0.5 && fc.puntos[3].p > 0.5, `el caso no es de late con el final en contra: ${JSON.stringify(fc.puntos.map((x) => x.p))}`);
  eq(fc.cambio, null, `dice un cambio de lado que las barras desmienten: ${JSON.stringify(fc.cambio)}`);
  eq(fasesDePartida({ pBase: 0.5, nos: [{ heroe: H('Nadie'), linea: 'roam' }], ellos: [], datosFases: df }), null, 'sin ninguna curva vuestra hay fases');
  eq(fasesDePartida({ pBase: 0.5, nos: [{ heroe: H('Tardio'), linea: 'gold' }], ellos: [], datosFases: { ...df, centro: null } }), null, 'sin centro hay fases');
});

test('con los datos de verdad: seis tramos, el centro de lo que sale, y el ranking no cambia por las curvas', () => {
  const catalogo = JSON.parse(readFileSync(`${RAIZ}/public/data/heroes.json`, 'utf8'));
  const meta = JSON.parse(readFileSync(`${RAIZ}/public/data/roam-meta.json`, 'utf8'));
  const datos = prepararDatos({ catalogo, meta });
  ok(Array.isArray(datos.meta.centroDeFases) && datos.meta.centroDeFases.length === 6, 'prepararDatos no calcula el centro de las fases');
  const n = (x) => datos.porNombre.get(x);
  const yo = datos.poolsPorLinea.roam[0];
  const enemigos = ['jungle', 'mid', 'gold', 'exp', 'roam'].map((l) => datos.poolsPorLinea[l].find((h) => h !== yo));
  const aliados = ['jungle', 'mid', 'gold', 'exp'].map((l) => datos.poolsPorLinea[l].find((h) => !enemigos.includes(h) && h !== yo));
  ok(yo && enemigos.every(Boolean) && aliados.every(Boolean) && !n('nadie'), 'no hay draft que montar');
  const plan = planear(datos, { yo, aliados, enemigos, linea: 'roam' });
  eq(plan.fases?.puntos?.length, 6, `el plan no trae las fases: ${JSON.stringify(plan.fases)}`);
  ok(plan.fases.puntos.every((x) => x.p > 0.05 && x.p < 0.95), 'una probabilidad por tramo imposible');
  // Las curvas se ENSEÑAN, no puntúan: el ranking es el mismo con y sin ellas.
  const sin = prepararDatos({ catalogo, meta: { ...meta, curvaLinea: undefined } });
  const con = ordenar(datos, { linea: 'roam', enemigos, aliados }).map((r) => `${r.heroe.name}:${r.p.toFixed(6)}`);
  const sinCurvas = ordenar(sin, { linea: 'roam', enemigos: enemigos.map((h) => sin.porNombre.get(h.name)), aliados: aliados.map((h) => sin.porNombre.get(h.name)) }).map((r) => `${r.heroe.name}:${r.p.toFixed(6)}`);
  eq(con.join(), sinCurvas.join(), 'las curvas cambian el ranking');
  eq(planear(sin, { yo: sin.porNombre.get(yo.name), aliados: [], enemigos: [sin.porNombre.get(enemigos[0].name)], linea: 'roam' }).fases, null, 'sin curvas hay fases');
});

test('tu rival de línea va en TU línea también en las curvas, aunque el reparto lo pusiera en otra (3.43.2)', () => {
  const catalogo = JSON.parse(readFileSync(`${RAIZ}/public/data/heroes.json`, 'utf8'));
  const meta = JSON.parse(readFileSync(`${RAIZ}/public/data/roam-meta.json`, 'utf8'));
  const datos = prepararDatos({ catalogo, meta });
  const lanes = (h) => datos.lineas.get(nombreClave(h.name))?.lanes ?? [];
  // Un enemigo que juega roam pero cuya línea principal es otra, junto a otro
  // que también puede ir a roam: el reparto a solas lo manda a su principal.
  let caso = null;
  for (const r of datos.poolsPorLinea.roam) {
    if (lanes(r)[0] === 'roam' || !buscar(meta.curvaLinea, r.name)?.roam) continue;
    for (const o of datos.poolsPorLinea.roam) {
      if (o === r) continue;
      if (lineasOcupadas([r, o], datos.lineas, datos.frecuencias)[0] !== 'roam') { caso = [r, o]; break; }
    }
    if (caso) break;
  }
  ok(caso, 'no hay un draft en que el reparto saque al rival de roam: la prueba no vigila nada');
  const yo = datos.poolsPorLinea.roam.find((x) => !caso.includes(x));
  const p = planear(datos, { yo, enemigos: caso, aliados: [], linea: 'roam', rivalMarcado: caso[0].name });
  eq(p.fases?.ellos.porHeroe.find((x) => x.heroe.name === caso[0].name)?.linea, 'roam', `la curva del rival marcado (${caso[0].name}) no es la de tu línea: ${JSON.stringify(p.fases?.ellos.porHeroe.map((x) => [x.heroe.name, x.linea]))}`);
});

await terminar('motor/fases');

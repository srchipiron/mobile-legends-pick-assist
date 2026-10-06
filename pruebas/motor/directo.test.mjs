/**
 * src/motor/directo.js (3.44.0): el plan y las fases como guion por minutos
 * para decirlo en voz alta, y el cierre por tramo. Propiedades: cada fase su
 * aviso con las probabilidades de SU tramo, nada de fases sin curvas, el
 * cambio de lado solo si el plan lo afirma, y los tramos repartidos IGUAL que
 * en la medida de las partidas pro (si no, lo medido en tus partidas no es lo
 * mismo que lo medido allí).
 */
import { readFileSync } from 'node:fs';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { guionEnDirecto, cierresPorTramo, tramoDeMinutos, MINUTOS, MAX_PARTES } from '../../src/motor/directo.js';
import { prepararDatos, planear } from '../../src/motor/draft.js';
import { tramoDe } from '../../scripts/medir-fases.mjs';
import es from '../../src/app/i18n/es.js';
import en from '../../src/app/i18n/en.js';

const puntos = (ps) => [10, 12, 14, 16, 18, 20].map((desde, i) => ({ desde, hasta: desde < 20 ? desde + 2 : null, p: ps[i] }));
const plan = ({ tendencia = 'igual', ps = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], cambio = null, tarde = [], ...resto } = {}) => ({
  equipo: [{ clave: 'partida.focus', params: { e: 'Layla' } }],
  etapas: { temprano: [{ clave: 'etapa.rivalGanas', params: { e: 'Atlas', pct: 53 } }], medio: [{ clave: 'partida.quedateCon', params: { a: 'Miya' } }], tarde },
  problemas: [{ clave: 'partida.evita', params: { e: 'Lylia', pct: 46 } }],
  fases: { pBase: 0.55, tendencia, cambio, puntos: puntos(ps) },
  ...resto,
});
const claves = (g) => g.flatMap((a) => a.partes.map((p) => p.clave));

test('de early: vuestro momento con la probabilidad de la partida corta, y después que cada minuto juega en contra con la de la larga', () => {
  const g = guionEnDirecto(plan({ tendencia: 'pronto', ps: [0.66, 0.63, 0.6, 0.55, 0.5, 0.44] }));
  eq(g[0].min, MINUTOS.inicio, 'el primer aviso no es el del inicio');
  eq(g[0].partes[0].params.p, 55, 'el inicio no dice la nota de siempre');
  ok(g[0].partes.some((p) => p.clave === 'partida.focus'), 'el inicio no dice el focus');
  eq(g.find((a) => a.partes[0].clave === 'directo.vuestroMomento')?.partes[0].params.p, 66, 'vuestro momento no lleva la probabilidad de la partida corta');
  eq(g.find((a) => a.partes[0].clave === 'directo.cadaMinutoContra')?.partes[0].params.p, 44, 'cada minuto en contra no lleva la de la larga');
  ok(!claves(g).includes('directo.aguantad'), 'de early dice «aguantad»');
  ok(g.every((a, i) => i === 0 || a.min >= g[i - 1].min), 'el guion no va en orden de minutos');
  ok(g.every((a) => a.partes.length >= 1 && a.partes.length <= MAX_PARTES), 'un aviso vacío o demasiado largo para decirlo');
  ok(claves(g).includes('partida.evita'), 'tu peor cruce no sale en las peleas');
});

test('de late: aguantad al principio y ahora vosotros al final; igualada, ninguno de los dos', () => {
  const g = guionEnDirecto(plan({ tendencia: 'tarde', ps: [0.42, 0.45, 0.5, 0.55, 0.6, 0.63] }));
  const ag = g.find((a) => a.partes[0].clave === 'directo.aguantad');
  ok(ag && ag.partes[0].params.p === 42 && ag.partes[0].params.fin === 63, `aguantad no lleva la corta y la larga: ${JSON.stringify(ag)}`);
  ok(claves(g).includes('directo.ahoraVosotros') && !claves(g).includes('directo.vuestroMomento'), 'de late no dice que llega vuestro momento');
  eq(g.find((a) => a.partes[0].clave === 'directo.veinteAFavor')?.partes[0].params.p, 63, 'pasado el 20 no dice la probabilidad a favor');
  const igual = guionEnDirecto(plan({ ps: [0.48, 0.48, 0.48, 0.47, 0.47, 0.47] }));
  ok(!claves(igual).some((c) => ['directo.aguantad', 'directo.ahoraVosotros', 'directo.vuestroMomento', 'directo.cadaMinutoContra'].includes(c)), 'igualada habla de fases');
  ok(claves(igual).includes('directo.veinteEnContra'), 'pasado el 20 en contra no se dice');
});

test('el cambio de lado solo si el plan lo afirma (con tres por bando), dos minutos antes; sin fases, solo el plan', () => {
  const sinAfirmar = guionEnDirecto(plan({ tendencia: 'pronto', ps: [0.6, 0.57, 0.53, 0.49, 0.46, 0.44], cambio: { minuto: 16, aFavor: false } }));
  ok(!claves(sinAfirmar).some((c) => c.startsWith('directo.cambia')), 'dice el cambio de lado que el plan calló (medio draft)');
  const afirmado = guionEnDirecto(plan({ tendencia: 'pronto', ps: [0.6, 0.57, 0.53, 0.49, 0.46, 0.44], cambio: { minuto: 16, aFavor: false }, tarde: [{ clave: 'etapa.cambiaEnContra', params: { min: 16 } }] }));
  eq(afirmado.find((a) => a.partes[0].clave === 'directo.cambiaEnContra')?.min, 14, 'el cambio de lado no se dice dos minutos antes');
  const sinFases = guionEnDirecto(plan({ fases: null }));
  ok(sinFases.length >= 1 && !claves(sinFases).some((c) => c.startsWith('directo.') && c !== 'directo.peleas'), `sin curvas habla de fases: ${claves(sinFases)}`);
  eq(guionEnDirecto(null).length, 0);
  eq(cierresPorTramo(null).length, 0);
});

test('el cierre, uno por tramo con su probabilidad; y los tramos, repartidos igual que en la medida de las partidas pro', () => {
  const c = cierresPorTramo(plan({ ps: [0.4, 0.45, 0.5, 0.55, 0.6, 0.65] }).fases);
  eq(c.length, 6);
  eq(`${c[0].params.desde}-${c[0].params.hasta}:${c[0].params.p}`, '10-12:40');
  eq(c[5].clave, 'directo.cierreLargo');
  for (let m = 3.1; m < 40; m += 0.1) {
    const mm = Math.floor(m), ss = Math.round((m - mm) * 60);
    if (ss === 60) continue;
    eq(tramoDeMinutos(m), tramoDe(`${mm}:${String(ss).padStart(2, '0')}`), `el minuto ${m.toFixed(1)} cae en otro tramo que en medir-fases`);
  }
  eq(tramoDeMinutos(0), null);
});

test('con los datos de verdad: el plan trae su guion, con claves que existen en los dos idiomas', () => {
  const catalogo = JSON.parse(readFileSync(`${RAIZ}/public/data/heroes.json`, 'utf8'));
  const meta = JSON.parse(readFileSync(`${RAIZ}/public/data/roam-meta.json`, 'utf8'));
  const datos = prepararDatos({ catalogo, meta });
  const yo = datos.poolsPorLinea.roam[0];
  const enemigos = ['jungle', 'mid', 'gold', 'exp', 'roam'].map((l) => datos.poolsPorLinea[l].find((h) => h !== yo));
  const aliados = ['jungle', 'mid', 'gold', 'exp'].map((l) => datos.poolsPorLinea[l].find((h) => !enemigos.includes(h) && h !== yo));
  const p = planear(datos, { yo, aliados, enemigos, linea: 'roam' });
  ok(p.directo.length >= 3, `el guion de un draft completo es corto: ${JSON.stringify(p.directo)}`);
  eq(p.cierres.length, 6, 'faltan cierres');
  for (const a of p.directo) for (const parte of a.partes) ok(es[parte.clave] && en[parte.clave], `la clave ${parte.clave} no existe en los dos idiomas`);
  eq(planear(datos, { yo: null }).directo.length, 0, 'sin héroe hay guion');
});

await terminar('motor/directo');

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
import { guionEnDirecto, cierresPorTramo, tramoDeMinutos, MINUTOS, MAX_PARTES, OBJETIVOS, ANTES_DEL_OBJETIVO } from '../../src/motor/directo.js';
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
  fasesConfiables: true,
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
  ok(sinFases.length >= 1 && !claves(sinFases).some((c) => c.startsWith('directo.') && !['directo.peleas', 'directo.tortuga', 'directo.lord'].includes(c)), `sin curvas habla de fases: ${claves(sinFases)}`);
  eq(guionEnDirecto(null).length, 0);
  eq(cierresPorTramo(null).length, 0);
});

test('tortuga y Lord (3.78.0): siempre, con o sin fases, con su antelación y el minuto en que salen', () => {
  for (const g of [guionEnDirecto(plan()), guionEnDirecto(plan({ fases: null }))]) {
    const tortuga = g.find((a) => a.partes.some((p) => p.clave === 'directo.tortuga'));
    const lord = g.find((a) => a.partes.some((p) => p.clave === 'directo.lord'));
    eq(tortuga?.min, 1.5, 'la tortuga no se avisa a los 1:30');
    eq(lord?.min, 7, 'el Lord no se avisa a los 7:00');
    eq(tortuga.partes.find((p) => p.clave === 'directo.tortuga').params.min, 2);
    eq(lord.partes.find((p) => p.clave === 'directo.lord').params.min, 8);
    ok(g.every((a, i) => i === 0 || a.min >= g[i - 1].min), 'el guion con objetivos no va en orden de minutos');
  }
  // Tiempos del parche (wiki y Liquipedia, 26 de octubre de 2026): un tiempo equivocado es peor que ninguno.
  eq(`${OBJETIVOS.tortuga}/${OBJETIVOS.lord}/${ANTES_DEL_OBJETIVO.tortuga}/${ANTES_DEL_OBJETIVO.lord}`, '2/8/0.5/1');
});

test('el cierre, uno por tramo con su probabilidad; y los tramos, repartidos igual que en la medida de las partidas pro', () => {
  const c = cierresPorTramo(plan({ ps: [0.4, 0.45, 0.5, 0.55, 0.6, 0.65] }).fases);
  eq(c.length, 6);
  eq(`${c[0].params.desde}-${c[0].params.hasta}:${c[0].params.p}`, '10-12:40');
  eq(c[5].clave, 'directo.cierreLargo');
  for (let d = 0; d < 950; d++) {
    const m = d / 10;
    const mm = Math.floor(m), ss = Math.round((m - mm) * 60);
    if (ss === 60) continue;
    eq(tramoDeMinutos(m), tramoDe(`${mm}:${String(ss).padStart(2, '0')}`), `el minuto ${m.toFixed(1)} cae en otro tramo que en medir-fases`);
  }
  eq(tramoDeMinutos(0), null);
  // Lo que medir-fases tira (de 3 minutos para abajo, de 90 para arriba) no tiene tramo aquí tampoco.
  eq(tramoDeMinutos(2.5), null); eq(tramoDeMinutos(3), null); eq(tramoDeMinutos(90), null);
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

test('cada frase de fase solo con su cifra del lado que dice, y solo si las fases se pueden afirmar (3.60.4)', () => {
  // De early pero por delante también al final: no «cada minuto juega para ellos: bajáis al 66%».
  const delante = claves(guionEnDirecto(plan({ tendencia: 'pronto', ps: [0.8, 0.78, 0.75, 0.72, 0.7, 0.66] })));
  ok(delante.includes('directo.vuestroMomento') && !delante.includes('directo.cadaMinutoContra'), `dice que bajáis con un 66%: ${delante}`);
  // De early pero por detrás desde el principio: ni «vuestro momento» con un 45%.
  const detras = claves(guionEnDirecto(plan({ tendencia: 'pronto', ps: [0.45, 0.42, 0.4, 0.36, 0.34, 0.32] })));
  ok(!detras.includes('directo.vuestroMomento') && detras.includes('directo.cadaMinutoContra'), `«vuestro momento» con un 45%: ${detras}`);
  // De late con ventaja ya al principio: ni «aguantad, solo un 59%».
  const lateBien = claves(guionEnDirecto(plan({ tendencia: 'tarde', ps: [0.59, 0.62, 0.65, 0.68, 0.71, 0.74] })));
  ok(!lateBien.includes('directo.aguantad') && lateBien.includes('directo.ahoraVosotros'), `«aguantad» con un 59%: ${lateBien}`);
  // De late sin llegar al 50 ni al final: ni «ya llega vuestro momento» con un 48%.
  const lateMal = claves(guionEnDirecto(plan({ tendencia: 'tarde', ps: [0.3, 0.34, 0.38, 0.42, 0.45, 0.48] })));
  ok(lateMal.includes('directo.aguantad') && !lateMal.includes('directo.ahoraVosotros'), `«vuestro momento» con un 48%: ${lateMal}`);
  // Sin poder afirmar las fases (menos de tres por bando): ninguna frase de fase.
  const sinAfirmar = claves(guionEnDirecto(plan({ tendencia: 'pronto', ps: [0.66, 0.63, 0.6, 0.55, 0.5, 0.44], fasesConfiables: false })));
  ok(!sinAfirmar.some((c) => ['directo.vuestroMomento', 'directo.cadaMinutoContra', 'directo.aguantad', 'directo.ahoraVosotros', 'directo.veinteAFavor', 'directo.veinteEnContra'].includes(c)), `con medio draft afirma fases: ${sinAfirmar}`);
  ok(sinAfirmar.includes('directo.inicio'), 'sin poder afirmar fases tampoco dice con cuánto salís');
});

test('con datos reales: con un solo enemigo (draft cerrado por la partida) la voz no afirma fases; con el draft completo, sí (3.60.4)', () => {
  const datos = prepararDatos({ catalogo: JSON.parse(readFileSync(`${RAIZ}/public/data/heroes.json`, 'utf8')), meta: JSON.parse(readFileSync(`${RAIZ}/public/data/roam-meta.json`, 'utf8')), rango: 'glory' });
  const h = (n) => datos.porNombre.get(n);
  const fase = (p) => claves(guionEnDirecto(p)).filter((c) => ['directo.vuestroMomento', 'directo.cadaMinutoContra', 'directo.aguantad', 'directo.ahoraVosotros', 'directo.veinteAFavor', 'directo.veinteEnContra'].includes(c));
  const uno = planear(datos, { yo: h('Tigreal'), aliados: ['Chou', 'Miya', 'Eudora'].map(h), enemigos: [h('Freya')], linea: 'roam' });
  ok(uno.fases && uno.fasesConfiables === false && !fase(uno).length, `con un enemigo la voz afirma fases: ${fase(uno)}`);
  const lleno = planear(datos, { yo: h('Tigreal'), aliados: ['Chou', 'Miya', 'Eudora', 'Fanny'].map(h), enemigos: ['Layla', 'Atlas', 'Lylia', 'Saber', 'Alucard'].map(h), linea: 'roam' });
  ok(lleno.fasesConfiables === true && fase(lleno).length, 'con el draft completo la voz no dice nada de las fases');
});

await terminar('motor/directo');

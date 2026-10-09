/**
 * Pruebas de `porQueDetras` (motor/ranking.js, 3.51.0) y de su frase
 * (src/app/porque.js): por qué un candidato va detrás del nº1, término a
 * término, en la misma escala que el desglose de la tarjeta.
 */
import { test, ok, eq, casi, leerJson, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { porQueDetras, MARGEN_EMPATE, PUNTOS_A_FAVOR } from '../../src/motor/ranking.js';
import { ESCALA, PUNTOS_POR_LOGIT } from '../../src/motor/modelo.js';
import { prepararDatos, ordenar, resolverNombres } from '../../src/motor/draft.js';
import { fraseDetras } from '../../src/app/porque.js';
import { crearT } from '../../src/app/i18n/index.js';

const T0 = { heroes: 0, cruces: 0, parejas: 0, equilibrio: 0, tu: 0, porVer: 0 };
const cand = (p, terminos) => ({ p, terminos: { ...T0, ...terminos } });
const pts = (logit) => ESCALA * logit * PUNTOS_POR_LOGIT;

test('el término en que más pierde, el que más gana, y en la escala del desglose', () => {
  const uno = cand(0.56, { heroes: 0.2, cruces: 0.1, parejas: 0 });
  const dos = cand(0.53, { heroes: 0.05, cruces: 0.15, parejas: -0.02 });
  const d = porQueDetras(dos, uno);
  eq(d.empate, false); casi(d.dif, 3, 1e-9);
  eq(d.principal.termino, 'heroes'); casi(d.principal.puntos, pts(0.15), 1e-9);
  eq(d.aFavor.termino, 'cruces'); casi(d.aFavor.puntos, pts(0.05), 1e-9);
});

test('lo que gana por debajo de medio punto no se dice', () => {
  const pequeno = 0.9 * PUNTOS_A_FAVOR / (ESCALA * PUNTOS_POR_LOGIT);
  const d = porQueDetras(cand(0.53, { heroes: 0, cruces: pequeno }), cand(0.56, { heroes: 0.2 }));
  eq(d.aFavor, null);
  const justo = 1.01 * PUNTOS_A_FAVOR / (ESCALA * PUNTOS_POR_LOGIT);
  ok(porQueDetras(cand(0.53, { cruces: justo }), cand(0.56, { heroes: 0.2 })).aFavor, 'por encima del umbral no se dice');
});

test('dentro del margen de empate es empate, y consigo mismo no hay nada que decir', () => {
  const uno = cand(0.55, { heroes: 0.1 });
  eq(porQueDetras(cand(0.55 - MARGEN_EMPATE * 0.9, { cruces: 0.1 }), uno).empate, true);
  eq(porQueDetras(cand(0.55 - MARGEN_EMPATE * 1.1, { cruces: 0.1 }), uno).empate, false);
  eq(porQueDetras(uno, uno), null);
  eq(porQueDetras(null, uno), null);
});

test('con datos reales, en cada puesto del ranking, las partes suman la diferencia de logit', () => {
  const datos = prepararDatos({ catalogo, meta: leerJson('public/data/roam-meta.json'), rango: 'glory' });
  const rk = ordenar(datos, { linea: 'roam', enemigos: resolverNombres(datos, ['Layla', 'Fanny', 'Chou']), aliados: resolverNombres(datos, ['Lukas']) });
  for (const c of rk.slice(1)) {
    const d = porQueDetras(c, rk[0]);
    if (d.empate) continue;
    const suma = Object.keys(c.terminos).reduce((a, k) => a + pts(rk[0].terminos[k] - c.terminos[k]), 0);
    casi(suma, (rk[0].logOdds - c.logOdds) * PUNTOS_POR_LOGIT, 1e-9);
    ok(d.principal.puntos > 0 && d.principal.puntos >= Math.max(...Object.keys(c.terminos).map((k) => pts(rk[0].terminos[k] - c.terminos[k]))) - 1e-12, `${c.heroe.name}: el principal no es el que más pierde`);
  }
});

test('la frase: empate, en qué pierde y en qué gana, en los dos idiomas', () => {
  const es = crearT('es'); const en = crearT('en');
  eq(fraseDetras({ empate: true }, 'Rafaela', es), 'Empatado con Rafaela: la diferencia cabe en el ruido del modelo.');
  const d = { empate: false, dif: 1.24, principal: { termino: 'heroes', puntos: 1.5 }, aFavor: { termino: 'cruces', puntos: 0.6 } };
  eq(fraseDetras(d, 'Rafaela', es), '1.2 puntos por detrás de Rafaela: más flojo en general (−1.5), aunque mejores cruces (+0.6).');
  eq(fraseDetras({ ...d, aFavor: null }, 'Rafaela', en), '1.2 points behind Rafaela: weaker overall (−1.5).');
  eq(fraseDetras({ empate: false, dif: 1, principal: null }, 'X', es), '1.0 puntos por detrás de X.');
  for (const k of ['heroes', 'cruces', 'parejas', 'equilibrio', 'tu', 'porVer']) {
    const f = fraseDetras({ ...d, principal: { termino: k, puntos: 1 }, aFavor: { termino: k, puntos: 1 } }, 'X', es);
    ok(!/porque\.|\{/.test(f), `clave cruda con ${k}: ${f}`);
  }
  eq(fraseDetras(null, 'X', es), null);
});

await terminar('motor/porque');

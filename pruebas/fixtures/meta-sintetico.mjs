/**
 * Un meta sintético y determinista con la forma del real, para medir lo que
 * hace el motor SIN depender de los datos del día. Nació en 3.7.1: la banda
 * de probabilidad de drafts al azar se exigía sobre los datos reales y el
 * reinicio de temporada la abrió sin que la escala cambiara (incidencia #9).
 */
import { catalogo } from './catalogo.mjs';
import { LINEAS } from '../../src/motor/catalogo.js';
import { generador } from '../../src/motor/robustez.js';
import { estimarCon } from '../../src/motor/draft.js';

/** p05/p95 de 1.000 drafts completos al azar (uno por línea, sin repetir). */
export function bandaDe(datos, pools) {
  const rnd = generador(3);
  const ps = [];
  for (let d = 0; d < 1000; d++) {
    const u = new Set();
    const coge = (ln) => { const c = pools[ln].filter((x) => !u.has(x.name)); const x = c[Math.floor(rnd() * c.length)]; u.add(x.name); return x; };
    const A = LINEAS.map(coge); const E = LINEAS.map(coge);
    ps.push(estimarCon(datos, { yo: A[0], aliados: A.slice(1), enemigos: E }).p);
  }
  ps.sort((a, b2) => a - b2);
  const q = (f) => ps[Math.floor(ps.length * f)];
  return { p05: q(0.05), p95: q(0.95) };
}

/**
 * Un meta determinista con la forma del real: los 133 nombres del catálogo,
 * cada uno con su línea (dos para uno de cada tres), su tipo de daño y su
 * winrate SACADOS DEL NOMBRE (nada depende del orden del fichero ni de los
 * datos del día), cruces antisimétricos y parejas simétricas con la
 * dispersión medida en las matrices reales (p90/p10 0,5154/0,4846 en los
 * cruces, 0,51 en las parejas: σ ≈ 0,012). Winrates con
 * σ 3,2 pp, que es la dispersión entre héroes de un parche asentado.
 */
export function metaSintetica() {
  const huella = (texto) => {
    let h = 2166136261;
    for (const c of texto) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h / 4294967296;
  };
  const normal = (texto) => {
    const u1 = Math.max(huella(`${texto}|a`), 1e-9); const u2 = huella(`${texto}|b`);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const nombres = catalogo.heroes.map((h) => h.name);
  const heroes = nombres.map((name, i) => {
    const lanes = [LINEAS[i % 5]];
    if (i % 3 === 0) lanes.push(LINEAS[(i + 2) % 5]);
    const tipo = i % 3;
    return { name, id: i + 1, role: 'fighter', lanes, damage: tipo === 0 ? { fisico: 3, magico: 0 } : tipo === 1 ? { fisico: 0, magico: 3 } : { fisico: 2, magico: 2 } };
  });
  const pesos = nombres.map((n) => 0.5 + huella(`${n}|pick`));
  const totalPeso = pesos.reduce((a, b) => a + b, 0);
  const stats = Object.fromEntries(nombres.map((n, i) => [n, { winRate: 0.5 + 0.032 * normal(`${n}|wr`), pickRate: pesos[i] / totalPeso, banRate: 0.1 * huella(`${n}|ban`), heroId: i + 1 }]));
  const counters = {}; const synergies = {};
  for (const a of nombres) { counters[a] = {}; synergies[a] = {}; }
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      const a = nombres[i]; const b = nombres[j];
      const c = 0.5 + 0.012 * normal(`${a}|${b}|c`);
      counters[a][b] = c; counters[b][a] = 1 - c;
      const sn = 0.495 + 0.012 * normal(`${a}|${b}|s`);
      synergies[a][b] = sn; synergies[b][a] = sn;
    }
  }
  return { generatedAt: '2026-09-25T00:00:00.000Z', rank: 'glory', ranks: ['glory'], days: 7, heroCount: nombres.length, heroes, stats, statsByRank: { glory: stats }, counters, synergies, diagnostics: {} };
}


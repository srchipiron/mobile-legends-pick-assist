#!/usr/bin/env node
/**
 * ¿Cuánto vale cada término del modelo, medido contra partidas de verdad?
 *
 * El motor de 2.0 ordena los picks por la probabilidad de ganar el draft que
 * resulta, y esa probabilidad es un modelo aditivo en log-odds cuyos
 * COEFICIENTES salen de aquí: una regresión logística sobre las partidas
 * profesionales (historial/pro-partidas.jsonl), con validación cruzada para
 * que no se ajuste al ruido. Antes los componentes se reescalaban min-max
 * dentro del pool y se sumaban con pesos escritos a mano (0.22/0.40/0.15...),
 * que nunca se midieron contra un resultado.
 *
 *   node scripts/ajustar-modelo.mjs                últimos 120 días
 *   node scripts/ajustar-modelo.mjs --dias 400     toda la muestra
 *   node scripts/ajustar-modelo.mjs --json f.json  además, el ajuste en JSON
 *
 * TÉRMINOS (por partida, equipo 1 menos equipo 2, todo en log-odds):
 *  - H: fuerza general, Σ logit(winrate) de los tuyos − los suyos.
 *  - C: cruces, Σ logit(c[a][e]) sobre los 25 pares (antisimétrica: c[e][a]
 *       es −c[a][e], así que el término ya es «tuyos menos suyos»).
 *  - S: parejas, Σ (logit(s) − logit(centro)) de tus 10 pares − las suyas.
 *  - R/O: C partido en los 5 cruces de LÍNEA (rival a rival, con el mismo
 *       reparto que la app) y los otros 20. El motor viejo ponía R a peso 2.
 *  - N: huecos de composición (TEAM_NEEDS) cubiertos, tuyos − suyos.
 *  - B: +1 si el equipo 1 es el azul, −1 si rojo, 0 si no se sabe.
 *
 * MODELOS comparados con validación cruzada (10 pliegues, misma partición):
 *  fijo    a=0, H+C+S con coeficiente 1 (la estimación de 1.28–1.41).
 *  escala  una sola pendiente sobre H+C+S.
 *  libre   un coeficiente por término (H, C, S).
 *  +lado   libre más B.
 *  +linea  libre con C partido en R y O.
 *  +huecos libre más N.
 *
 * Lo que se mira: log-verosimilitud fuera de muestra (lo que se optimiza),
 * AUC y Brier. Una diferencia de log-verosimilitud menor que ~2 por 1.000
 * partidas no distingue nada.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCatalog, indexByName, normName, matchup, sinergia, LINEAS, SATISFIES } from '../src/engine/score.js';
import { TEAM_NEEDS } from '../src/engine/rules.js';
import { indiceDeLineas, frecuenciaDeRoles } from '../src/engine/rival-de-linea.js';
import { mediaDeSinergia } from '../src/engine/estimacion.js';
import { logistica, asignarLineas } from './medir-rival.mjs';
import { resolverHeroe } from './ingesta-pro.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const logit = (p) => Math.log(p / (1 - p));
const sigmoide = (x) => 1 / (1 + Math.exp(-x));
const valido = (p) => typeof p === 'number' && p > 0.02 && p < 0.98;

/** Los términos de una partida ya resuelta a héroes: { H, C, S, R, O, N, B, y }. */
export function terminosDe(p, { M, info, frec, centro }) {
  const [A, E] = p.equipos;
  const wr = (h) => M.stats[normName(h.name)]?.winRate;
  let H = 0;
  for (const h of A) { const w = wr(h); if (valido(w)) H += logit(w); }
  for (const h of E) { const w = wr(h); if (valido(w)) H -= logit(w); }
  const la = asignarLineas(A, info, frec); const le = asignarLineas(E, info, frec);
  let R = 0; let O = 0;
  for (const a of A) for (const e of E) {
    const c = matchup(M.counters, a.name, e.name);
    if (!valido(c)) continue;
    if (LINEAS.some((l) => la[l] === a && le[l] === e)) R += logit(c); else O += logit(c);
  }
  const parejas = (eq) => {
    let t = 0;
    for (let i = 0; i < eq.length; i++) for (let j = i + 1; j < eq.length; j++) {
      const s = sinergia(M.synergies, eq[i].name, eq[j].name);
      if (valido(s)) t += logit(s) - logit(centro);
    }
    return t;
  };
  const S = parejas(A) - parejas(E);
  const huecos = (eq) => {
    const tags = new Set(eq.flatMap((h) => h.tags ?? []));
    return TEAM_NEEDS.reduce((s, n) => s + ((SATISFIES[n.tag] ?? [n.tag]).some((t) => tags.has(t)) ? n.weight : 0), 0);
  };
  const N = huecos(A) - huecos(E);
  const B = p.lado1 === 'blue' ? 1 : p.lado1 === 'red' ? -1 : 0;
  return { H, C: R + O, S, R, O, N, B, y: p.ganador === 1 ? 1 : 0 };
}

/** Log-verosimilitud, AUC y Brier de una lista de { L, y }. */
export function evaluar(filas) {
  const n = filas.length;
  let logL = 0; let brier = 0;
  for (const r of filas) { const p = sigmoide(r.L); logL += Math.log(r.y ? p : 1 - p); brier += (p - r.y) ** 2; }
  const pos = filas.filter((r) => r.y === 1); const neg = filas.filter((r) => r.y === 0);
  let bien = 0;
  for (const a of pos) for (const b of neg) bien += a.L > b.L ? 1 : a.L === b.L ? 0.5 : 0;
  return { n, logL, auc: pos.length && neg.length ? bien / (pos.length * neg.length) : null, brier: brier / n };
}

/** Un generador determinista para la partición: misma partición para todos los modelos. */
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Validación cruzada de un modelo lineal en log-odds. `x(f)` da el vector de
 * covariables (sin el intercepto); `conIntercepto` añade la columna de unos.
 * Con `fijo`, no se ajusta nada: L = Σ x·fijo.
 */
export function validar(filas, x, { conIntercepto = true, fijo = null, pliegues = 10, semilla = 7 } = {}) {
  const rnd = mulberry32(semilla);
  const orden = filas.map((f, i) => ({ f, r: rnd(), i })).sort((a, b) => a.r - b.r).map((o) => o.i);
  const pliegueDe = new Array(filas.length);
  orden.forEach((i, k) => { pliegueDe[i] = k % pliegues; });
  const fuera = [];
  for (let k = 0; k < pliegues; k++) {
    const entrena = filas.filter((_, i) => pliegueDe[i] !== k);
    const prueba = filas.filter((_, i) => pliegueDe[i] === k);
    let b;
    if (fijo) b = conIntercepto ? [0, ...fijo] : fijo;
    else b = logistica(entrena.map((f) => (conIntercepto ? [1, ...x(f)] : x(f))), entrena.map((f) => f.y)).b;
    for (const f of prueba) {
      const v = conIntercepto ? [1, ...x(f)] : x(f);
      fuera.push({ L: v.reduce((s, c, j) => s + c * b[j], 0), y: f.y });
    }
  }
  const todo = fijo ? null : logistica(filas.map((f) => (conIntercepto ? [1, ...x(f)] : x(f))), filas.map((f) => f.y));
  return { cv: evaluar(fuera), ajuste: todo };
}

export async function cargar(dias) {
  const desde = new Date(Date.now() - dias * 86400e3).toISOString().slice(0, 10);
  const lineas = (await readFile(resolve(ROOT, 'historial/pro-partidas.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const cat = JSON.parse(await readFile(resolve(ROOT, 'public/data/heroes.json'), 'utf8'));
  const meta = JSON.parse(await readFile(resolve(ROOT, 'public/data/roam-meta.json'), 'utf8'));
  const heroes = mergeCatalog(cat.heroes, meta.heroes ?? []);
  const info = indiceDeLineas(meta.heroes ?? []); const frec = frecuenciaDeRoles(meta.heroes ?? []);
  const M = { stats: indexByName(meta.stats), counters: indexByName(meta.counters, 2), synergies: indexByName(meta.synergies, 2) };
  const centro = mediaDeSinergia(M.synergies, info, M.stats);
  const indice = new Map(heroes.map((h) => [normName(h.name), h]));
  const usables = [];
  for (const p of lineas.filter((x) => x.fecha && x.fecha >= desde)) {
    const eq = p.picks.map((lado) => lado.map((s) => resolverHeroe(s, indice)));
    if (eq.flat().every(Boolean)) usables.push({ ...p, equipos: eq });
  }
  return { desde, usables, ctx: { M, info, frec, centro }, meta };
}

export const MODELOS = {
  fijo: { x: (f) => [f.H, f.C, f.S], fijo: [1, 1, 1] },
  escala: { x: (f) => [f.H + f.C + f.S] },
  libre: { x: (f) => [f.H, f.C, f.S] },
  '+lado': { x: (f) => [f.H, f.C, f.S, f.B] },
  '+linea': { x: (f) => [f.H, f.R, f.O, f.S] },
  '+huecos': { x: (f) => [f.H, f.C, f.S, f.N] },
  'sin parejas': { x: (f) => [f.H, f.C] },
};

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const dias = Number(opt('--dias')) || 120;
  const json = opt('--json') ?? null;
  const { desde, usables, ctx, meta } = await cargar(dias);
  const filas = usables.map((p) => terminosDe(p, ctx));
  console.log(`Partidas desde ${desde}: ${filas.length} usables · datos del ${meta.generatedAt?.slice(0, 10)}`);
  const sd = (k) => { const v = filas.map((f) => f[k]); const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
  console.log(`σ de cada término: H ${sd('H').toFixed(3)} · C ${sd('C').toFixed(3)} (R ${sd('R').toFixed(3)}, O ${sd('O').toFixed(3)}) · S ${sd('S').toFixed(3)} · N ${sd('N').toFixed(3)}`);
  const f = (v, d = 3) => (v == null ? '—' : Number(v).toFixed(d));
  const salida = { desde, usables: filas.length, datosDe: meta.generatedAt ?? null, modelos: {} };
  for (const [nombre, m] of Object.entries(MODELOS)) {
    const r = validar(filas, m.x, { fijo: m.fijo ?? null });
    const coef = r.ajuste ? r.ajuste.b.slice(1).map((b, i) => `${f(b, 2)}±${f(r.ajuste.se[i + 1], 2)}`).join(' ') : '(1 1 1)';
    console.log(`${nombre.padEnd(12)} logL/n ${f(r.cv.logL / r.cv.n, 4)} · AUC ${f(r.cv.auc)} · Brier ${f(r.cv.brier, 4)}   coef: ${coef}${r.ajuste ? ` · a ${f(r.ajuste.b[0], 2)}` : ''}`);
    salida.modelos[nombre] = { cv: r.cv, coef: r.ajuste?.b ?? null, se: r.ajuste?.se ?? null };
  }
  if (json) await writeFile(json, JSON.stringify(salida));
}

const ejecutadoDirectamente = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ejecutadoDirectamente) main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });

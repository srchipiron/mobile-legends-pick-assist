#!/usr/bin/env node
/**
 * ¿La curva por duración predice? (3.43.0, src/motor/fases.js)
 *
 * Sobre las partidas pro con su duración (historial/pro-partidas.jsonl), el
 * modelo de siempre (héroes + cruces + parejas + equilibrio, la misma cuenta
 * que ajustar-modelo.mjs) frente al mismo más la FORMA de las curvas de los
 * dos equipos en el tramo en que acabó la partida (cada héroe en la línea
 * que le da el reparto de la app). Validación cruzada con varias semillas:
 * la ganancia de log-verosimilitud fuera de muestra por 1.000 partidas y el
 * coeficiente de la forma, que es `COEF_FASE`. Y la prueba a la contra: con
 * las curvas BARAJADAS entre héroes la ganancia tiene que desaparecer.
 *
 *   node scripts/medir-fases.mjs [--dias 400] [--semillas 8]
 *
 * Medido el 5 de octubre de 2026 (curvas de Gloria, 2.268 partidas, 400
 * días): +4,9 por 1.000, coeficiente 0,71 ± 0,15; barajadas, +0,45.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargar, terminosDe, validar } from './ajustar-modelo.mjs';
import { asignarLineas } from './medir-rival.mjs';
import { LINEAS } from '../src/motor/catalogo.js';
import { PESO_EQUILIBRIO_DANO } from '../src/motor/modelo.js';
import { formaDe, TRAMOS, COEF_FASE } from '../src/motor/fases.js';
import { indexarPorNombre, buscar } from '../src/motor/nombres.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** El tramo de una duración «mm:ss»: 10–12 → 0 … 20+ → 5; null si no se lee. */
export function tramoDe(duracion) {
  const [m, s] = String(duracion ?? '').split(':').map(Number);
  const min = m + (s || 0) / 60;
  if (!(min > 3 && min < 90)) return null;
  return Math.max(0, Math.min(TRAMOS.length - 1, Math.floor((min - TRAMOS[0]) / 2)));
}

/** Por tramo, la suma de las formas de un equipo de cinco con las líneas de la app. */
function formaDeLos(eq, ctx, curvas, totales) {
  const la = asignarLineas(eq, ctx.info, ctx.frec);
  const f = TRAMOS.map(() => 0); let con = 0;
  for (const l of LINEAS) {
    const h = la[l]; if (!h) continue;
    const porLinea = buscar(curvas, h.name) ?? {};
    const linea = porLinea[l] ? l : Object.keys(porLinea)[0];
    const forma = linea ? formaDe(porLinea[linea], buscar(totales, h.name)?.[linea]) : null;
    if (!forma) continue;
    con += 1; forma.forEach((v, i) => { f[i] += v; });
  }
  return { f, con };
}

/** Las filas de la regresión: base del modelo y F (diferencia de formas en el tramo real). */
export function filasConFase(usables, ctx, curvas, totales) {
  const filas = [];
  for (const p of usables) {
    const t = tramoDe(p.duracion);
    if (t == null) continue;
    const A = formaDeLos(p.equipos[0], ctx, curvas, totales);
    const E = formaDeLos(p.equipos[1], ctx, curvas, totales);
    if (A.con < 4 || E.con < 4) continue;
    const x = terminosDe(p, ctx);
    filas.push({ y: x.y, base: x.H + x.C + x.S + PESO_EQUILIBRIO_DANO * x.D, F: A.f[t] - E.f[t] });
  }
  return filas;
}

/** Ganancia media fuera de muestra (por 1.000 partidas) de añadir F, y su coeficiente. */
export function medirFase(filas, semillas) {
  let base = 0; let fase = 0; let ultima = null;
  for (const s of semillas) {
    base += validar(filas, (f) => [f.base], { semilla: s }).cv.logL;
    ultima = validar(filas, (f) => [f.base, f.F], { semilla: s });
    fase += ultima.cv.logL;
  }
  return { ganancia: ((fase - base) / semillas.length / filas.length) * 1000, coef: ultima.ajuste.b[2], error: ultima.ajuste.se?.[2] ?? null };
}

/** Las mismas curvas repartidas al azar entre los pares héroe-línea (determinista). */
function barajar(curvas) {
  const pares = Object.entries(curvas).flatMap(([h, porLinea]) => Object.entries(porLinea).map(([l, c]) => [h, l, c]));
  let a = 7;
  const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cs = pares.map((p) => p[2]);
  for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cs[i], cs[j]] = [cs[j], cs[i]]; }
  const out = {};
  pares.forEach(([h, l], i) => { (out[h] ??= {})[l] = cs[i]; });
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
  const dias = opt('--dias', 400);
  const semillas = [7, 11, 13, 17, 19, 23, 29, 31].slice(0, opt('--semillas', 8));
  const meta = JSON.parse(await readFile(resolve(ROOT, 'public/data/roam-meta.json'), 'utf8'));
  if (!meta.curvaLinea) { console.log('roam-meta.json no trae curvaLinea: nada que medir.'); return; }
  const { usables, ctx } = await cargar(dias);
  const curvas = indexarPorNombre(meta.curvaLinea); const totales = indexarPorNombre(meta.winrateLinea ?? {});
  const filas = filasConFase(usables, ctx, curvas, totales);
  if (filas.length < 100) { console.log(`Solo ${filas.length} partidas pro con duración y curvas: no se puede medir.`); return; }
  const r = medirFase(filas, semillas);
  const b = medirFase(filasConFase(usables, ctx, indexarPorNombre(barajar(meta.curvaLinea)), totales), semillas);
  const f2 = (v) => (v == null ? '—' : v.toFixed(2));
  console.log(`Fases contra ${filas.length} partidas pro de ${dias} días (${semillas.length} semillas de partición):`);
  console.log(`  con las curvas:    ${f2(r.ganancia)} de logL por 1.000 fuera de muestra · coeficiente ${f2(r.coef)} ± ${f2(r.error)} (el motor usa COEF_FASE = ${COEF_FASE})`);
  console.log(`  curvas barajadas:  ${f2(b.ganancia)} · coeficiente ${f2(b.coef)} ± ${f2(b.error)} (tiene que quedarse en ruido)`);
  if (r.error && Math.abs(r.coef - COEF_FASE) > 2.5 * r.error) console.log('  OJO: el coeficiente medido se aleja más de 2,5 errores típicos del del motor: volver a calibrar COEF_FASE.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

#!/usr/bin/env node
/**
 * Lo que dicen TUS partidas (historial/partidas.json): si seguir a la app
 * hace ganar, si la probabilidad que enseñó se parece a lo que pasó, y cómo
 * puntúa el modelo DE HOY los drafts que tuviste delante. Es el gemelo de
 * `medir-pro.mjs` para tu cola, y sale en Markdown para pegarlo en la
 * incidencia que trajo las partidas (partidas.yml).
 *
 *   node scripts/medir-mias.mjs [--fichero historial/partidas.json] [--json salida.json]
 *
 * Nunca falla por falta de partidas: con pocas dice cuántas faltan. Un
 * fallo de verdad (fichero ilegible) sí sale con código 1.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resumen, calibracion, esPrevia, siguioConsejo } from '../src/motor/registro.js';
import { prepararDatos, estimarCon, resolverNombres } from '../src/motor/draft.js';
import { logit } from '../src/motor/modelo.js';
import { logistica } from './medir-rival.mjs';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto = null) => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : porDefecto; };

const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const pp = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;

/** Área bajo la curva ROC por rangos (empates a medias). */
export function auc(pares) {
  const pos = pares.filter((p) => p.y).map((p) => p.p); const neg = pares.filter((p) => !p.y).map((p) => p.p);
  if (!pos.length || !neg.length) return null;
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

/** El modelo de hoy sobre los drafts guardados: p para cada partida con draft y pick conocidos. */
export function repuntuar(partidas, datos) {
  const filas = [];
  for (const p of partidas) {
    if (esPrevia(p) || !p.draft) continue;
    const [yo] = resolverNombres(datos, [p.pick]);
    if (!yo) continue;
    const aliados = resolverNombres(datos, p.draft.aliados ?? []);
    const enemigos = resolverNombres(datos, p.draft.enemigos ?? []);
    if (!enemigos.length && !aliados.length) continue;
    const r = estimarCon(datos, { yo, aliados, enemigos });
    if (!r || !(r.p > 0 && r.p < 1)) continue;
    filas.push({ t: p.t, pick: p.pick, p: r.p, y: p.gane ? 1 : 0, vistos: aliados.length + enemigos.length + 1 });
  }
  return filas;
}

export function medir(registro, datos) {
  const partidas = registro.partidas ?? [];
  const maestria = registro.maestria ?? {};
  const conApp = partidas.filter((p) => !esPrevia(p));
  const ganadas = conApp.filter((p) => p.gane).length;
  const salida = { n: partidas.length, conApp: conApp.length, previas: partidas.length - conApp.length, ganadas, wr: conApp.length ? ganadas / conApp.length : null };
  salida.veredicto = resumen(partidas, maestria);
  salida.calibracion = calibracion(partidas);
  const filas = datos ? repuntuar(partidas, datos) : [];
  if (filas.length) {
    const n = filas.length;
    const brier = filas.reduce((a, f) => a + (f.p - f.y) ** 2, 0) / n;
    const brierSE = n > 1 ? Math.sqrt(filas.reduce((a, f) => a + ((f.p - f.y) ** 2 - brier) ** 2, 0) / (n - 1) / n) : 0;
    const acierto = filas.filter((f) => (f.p >= 0.5) === (f.y === 1)).length / n;
    let pendiente = null;
    if (n >= 10 && filas.some((f) => f.y) && filas.some((f) => !f.y)) {
      const r = logistica(filas.map((f) => [1, logit(f.p)]), filas.map((f) => f.y));
      pendiente = { b: r.b[1], se: r.se[1] };
    }
    salida.hoy = { n, brier, brierSE, auc: auc(filas), acierto, pendiente, mediaP: filas.reduce((a, f) => a + f.p, 0) / n, real: filas.reduce((a, f) => a + f.y, 0) / n };
  } else {
    salida.hoy = { n: 0 };
  }
  const porHeroe = new Map();
  for (const p of conApp) { const h = porHeroe.get(p.pick) ?? { pick: p.pick, n: 0, ganadas: 0 }; h.n += 1; h.ganadas += p.gane ? 1 : 0; porHeroe.set(p.pick, h); }
  salida.porHeroe = [...porHeroe.values()].sort((a, b) => b.n - a.n || a.pick.localeCompare(b.pick));
  const porMes = new Map();
  for (const p of conApp) { const k = new Date(p.t).toISOString().slice(0, 7); const m = porMes.get(k) ?? { mes: k, n: 0, ganadas: 0, siguiendo: 0 }; m.n += 1; m.ganadas += p.gane ? 1 : 0; m.siguiendo += siguioConsejo(p) ? 1 : 0; porMes.set(k, m); }
  salida.porMes = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  return salida;
}

export function informe(m, { generado = null } = {}) {
  const L = [];
  L.push(`## Tus partidas: ${m.n} apuntadas · ${m.conApp} con la app · ${m.previas} de tu historial`);
  if (!m.conApp) { L.push('', 'Todavía no hay partidas apuntadas con la app. Con cada partida que apuntes (Gané/Perdí al volver a la app) esto empieza a decir algo.'); return L.join('\n'); }
  L.push('', `Con la app: ${m.ganadas} ganadas de ${m.conApp} (${pct(m.wr)}).`);
  const v = m.veredicto;
  L.push('', '### ¿Sirve seguir a la app?');
  L.push(`- Siguiendo la recomendación: ${v.siguiendo} ${v.siguiendo === 1 ? 'partida' : 'partidas'}, ${pct(v.wrSiguiendo)} ganadas · por libre: ${v.porLibre}, ${pct(v.wrPorLibre)}.`);
  if (v.contraReferencia) {
    const c = v.contraReferencia;
    L.push(`- Contra tu winrate de siempre (${pct(c.base)} en ${c.partidasBase} partidas): ${pp(c.dif)} puntos ± ${(c.margen * 100).toFixed(1)}. ${c.seVe ? 'Se distingue del azar.' : `Todavía no se distingue del azar${c.faltan != null ? `: faltan unas ${c.faltan} partidas siguiendo la app` : ''}.`}`);
  } else {
    L.push('- Contra tu winrate de siempre: hacen falta al menos 5 partidas siguiendo la app y tu maestría escrita.');
  }
  L.push(`- Siguiendo/por libre: ${v.concluyente ? 'ya hay 30 y 30, se puede concluir' : `faltan ${v.faltan} para tener 30 y 30`}. Ojo: no está aleatorizado, tú eliges cuándo hacer caso.`);
  const c = m.calibracion;
  L.push('', '### ¿La probabilidad que enseñó se parece a lo que pasó?');
  if (!c.n) L.push('- Ninguna partida guarda la estimación (se guarda sola al apuntar desde 1.28).');
  else {
    L.push(`- ${c.n} partidas con estimación: previsto ${pct(c.prevista)}, real ${pct(c.real)}. Brier ${c.brier.toFixed(3)} ± ${(1.96 * c.brierSE).toFixed(3)} (una moneda: 0.250)${c.peorQueMoneda ? ' · PEOR que una moneda' : ''}.`);
    L.push(`- Con ≥50%: ${c.altas.n} partidas, ${pct(c.altas.real)} ganadas · con <50%: ${c.bajas.n}, ${pct(c.bajas.real)}.${c.concluyente ? '' : ` Faltan ${c.faltan} para decir algo.`}`);
  }
  const h = m.hoy;
  L.push('', `### El modelo de hoy sobre tus drafts${generado ? ` (datos del ${generado.slice(0, 10)})` : ''}`);
  if (!h.n) L.push('- Ninguna partida lleva el draft guardado (se guarda solo desde 3.5.0).');
  else {
    L.push(`- ${h.n} drafts re-puntuados con el modelo y los datos de hoy: media prevista ${pct(h.mediaP)}, real ${pct(h.real)}, acierta el lado (≥50%) el ${pct(h.acierto)}.`);
    L.push(`- Brier ${h.brier.toFixed(3)} ± ${(1.96 * h.brierSE).toFixed(3)} · AUC ${h.auc == null ? '—' : h.auc.toFixed(3)} (0,5 es una moneda; en pro sale 0,56–0,61).`);
    if (h.pendiente) L.push(`- Pendiente sobre el log-odds: ${h.pendiente.b.toFixed(2)} ± ${h.pendiente.se.toFixed(2)} (1 = la escala vale también en tu cola; con menos de 100 partidas el ± manda).`);
  }
  if (m.porHeroe.length) {
    L.push('', '### Por héroe (con la app)', '', '| Héroe | Partidas | Ganadas | % |', '|---|---:|---:|---:|');
    for (const x of m.porHeroe.slice(0, 15)) L.push(`| ${x.pick} | ${x.n} | ${x.ganadas} | ${pct(x.ganadas / x.n)} |`);
  }
  if (m.porMes.length) {
    L.push('', '### Por mes (con la app)', '', '| Mes | Partidas | Siguiendo la app | Ganadas | % |', '|---|---:|---:|---:|---:|');
    for (const x of m.porMes) L.push(`| ${x.mes} | ${x.n} | ${x.siguiendo} | ${x.ganadas} | ${pct(x.ganadas / x.n)} |`);
  }
  return L.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('medir-mias.mjs')) {
  const fichero = opcion('--fichero', 'historial/partidas.json');
  let registro;
  try { registro = existsSync(fichero) ? JSON.parse(readFileSync(fichero, 'utf8')) : { partidas: [], maestria: {} }; } catch (e) { console.error(`No puedo leer ${fichero}: ${e.message}`); process.exit(1); }
  let datos = null; let generado = null;
  try {
    const catalogo = JSON.parse(readFileSync('public/data/heroes.json', 'utf8'));
    const meta = JSON.parse(readFileSync('public/data/roam-meta.json', 'utf8'));
    datos = prepararDatos({ catalogo, meta });
    generado = meta.generatedAt ?? null;
  } catch { /* sin datos del meta no se re-puntúa, el resto sí */ }
  const m = medir(registro, datos);
  console.log(informe(m, { generado }));
  const json = opcion('--json');
  if (json) writeFileSync(json, JSON.stringify({ cuando: new Date().toISOString(), datosDe: generado, ...m }, null, 1));
}

#!/usr/bin/env node
/**
 * Mide el lector con lo que llega de la tablet (3.82.0): los recortes de los
 * drafts que no leyó enteros (`recortes_recientes`) contra la partida de
 * verdad (`partidas_comunidad`, con lo que Javi arregla después en el
 * historial: enemigos, compañeros y su héroe). Para cada draft, qué se lee
 * hoy hueco a hueco y qué falta; y repite el aprendizaje de la tablet
 * (`aprenderDe`, el mismo) sobre todos los drafts en orden, para proponer las
 * caras de compañero que quedan confirmadas (la misma skin en dos drafts y
 * ninguna de otro héroe parecida) y que pueden ir de serie en
 * `scripts/lector/caras-panel.json`. NO escribe nada en el repositorio: lo
 * que entra de serie se mira antes (3.59.5, 3.80.0).
 *
 *   node scripts/medir-lector.mjs [--horas 168] [--json salida.json]
 *
 * Las pantallas del final (`tipo: 'final'`, 3.81.5) solo se cuentan: se miran
 * a mano.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sanearConfig, bajarRecortes, bajarComunidad } from '../src/app/basedatos.js';
import { nombreClave } from '../src/motor/nombres.js';
import { carasGuardadas, carasDelPanel, leerPicksEnemigos, leerAliados } from './lector/leer.mjs';
import { aprenderDe } from './lector/aprender.mjs';
import { devolverPicks } from './lector/recortes.mjs';

const k = (n) => nombreClave(n ?? '');

/**
 * `recortes`: filas de `recortes_recientes` ({ j, recibido, d }) o sus `d`.
 * `partidas`: las partidas con `t`, `pick` y `draft` (de `partidas_comunidad`,
 * su `d`). Nunca lanza con datos raros: lo que no se entiende no cuenta.
 */
export function medirRecortes({ recortes = [], partidas = [], caras = carasGuardadas(), aprender = aprenderDe } = {}) {
  const porT = new Map((partidas ?? []).filter((p) => Number.isFinite(p?.t) && p.draft).map((p) => [p.t, p]));
  const salida = { recortes: 0, finales: 0, sinPartida: 0, drafts: [], rivales: { leidos: 0, de: 0, falsos: 0 }, aliados: { leidos: 0, de: 0, falsos: 0 }, tuFila: { leidos: 0, de: 0 }, faltan: {}, candidatas: [] };
  const porDraft = [];
  for (const fila of recortes ?? []) {
    const d = fila?.d ?? fila;
    if (!d || typeof d !== 'object') continue;
    if (d.tipo === 'final') { salida.finales += 1; continue; }
    salida.recortes += 1;
    const p = porT.get(d.partida);
    if (!p) { salida.sinPartida += 1; continue; }
    const verdad = { enemigos: p.draft.enemigos ?? [], aliados: p.draft.aliados ?? [], tuyo: p.supuesto ? null : p.pick };
    const vE = new Set(verdad.enemigos.map(k)), vA = new Set(verdad.aliados.map(k));
    const leidosE = new Set(), leidosA = new Set();
    let tuyoLeido = false, falsosE = 0, falsosA = 0;
    const pares = [];
    for (const c of Array.isArray(d.capturas) ? d.capturas : []) {
      if (typeof c?.picks !== 'string' || typeof c.id !== 'string') continue;
      let img;
      try { img = devolverPicks(c.picks); } catch { continue; }
      for (const l of leerPicksEnemigos(img, caras)) if (l.nombre) { if (vE.has(k(l.nombre))) leidosE.add(k(l.nombre)); else falsosE += 1; }
      const fila = Number.isInteger(c.tuyoFila) ? c.tuyoFila : -1;
      leerAliados(img, caras).forEach((l, i) => {
        if (!l.nombre) return;
        if (i === fila) { if (verdad.tuyo && k(l.nombre) === k(verdad.tuyo)) tuyoLeido = true; return; }
        if (vA.has(k(l.nombre))) leidosA.add(k(l.nombre)); else falsosA += 1;
      });
      pares.push({ id: c.id, verdad, img });
    }
    salida.rivales.leidos += leidosE.size; salida.rivales.de += vE.size; salida.rivales.falsos += falsosE;
    salida.aliados.leidos += leidosA.size; salida.aliados.de += vA.size; salida.aliados.falsos += falsosA;
    if (verdad.tuyo) { salida.tuFila.de += 1; if (tuyoLeido) salida.tuFila.leidos += 1; }
    const faltan = [...verdad.enemigos.filter((n) => !leidosE.has(k(n))), ...verdad.aliados.filter((n) => !leidosA.has(k(n)))];
    for (const n of faltan) salida.faltan[n] = (salida.faltan[n] ?? 0) + 1;
    salida.drafts.push({ partida: p.t, editada: Number.isFinite(p.editada), capturas: pares.length, faltan });
    porDraft.push({ t: p.t, pares });
  }
  // La repetición del aprendizaje de la tablet, draft a draft y en orden.
  let aprendido = null;
  for (const { pares } of porDraft.sort((a, b) => a.t - b.t)) {
    if (pares.length) aprendido = aprender(pares, { caras, aprendido }).aprendido;
  }
  const deSerie = new Set(carasDelPanel('aliados').map((c) => k(c.nombre)));
  salida.candidatas = Object.entries(aprendido?.aliados ?? {})
    .filter(([nombre]) => !deSerie.has(k(nombre)))
    .flatMap(([nombre, lista]) => lista.map((r) => ({ panel: 'aliados', nombre, fuente: `recorte de la tablet ${r.de}`, v: r.v })));
  return salida;
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');

/** El informe en texto, para leerlo desde el móvil. */
export function informeLector(m) {
  const faltan = Object.entries(m.faltan).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, c]) => `${n} ${c}`).join(', ');
  return [
    `Recortes: ${m.recortes} (${m.drafts.length} con su partida, ${m.sinPartida} sin ella) y ${m.finales} pantallas del final.`,
    `Rivales leídos: ${m.rivales.leidos} de ${m.rivales.de} (${pct(m.rivales.leidos, m.rivales.de)}), ${m.rivales.falsos} de más.`,
    `Compañeros leídos: ${m.aliados.leidos} de ${m.aliados.de} (${pct(m.aliados.leidos, m.aliados.de)}), ${m.aliados.falsos} de más.`,
    `Tu fila: ${m.tuFila.leidos} de ${m.tuFila.de}.`,
    `Los que más faltan: ${faltan || 'ninguno'}.`,
    m.candidatas.length
      ? `Caras de compañero confirmadas que no van de serie: ${[...new Set(m.candidatas.map((c) => c.nombre))].join(', ')} (con --json, listas para mirarlas y pegarlas en caras-panel.json).`
      : 'Ninguna cara de compañero nueva confirmada.',
  ].join('\n');
}

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const config = sanearConfig(JSON.parse(readFileSync(resolve(raiz, 'public/comunidad.json'), 'utf8')));
  if (!config) { console.error('public/comunidad.json no tiene una base de datos válida.'); process.exit(2); }
  const r = await bajarRecortes(config, { horas: Number(arg('--horas') ?? 168) });
  if (r.error) { console.error(`No se pudieron bajar los recortes: ${r.error}`); process.exit(2); }
  const c = await bajarComunidad(config);
  if (c.error) { console.error(`No se pudieron bajar las partidas: ${c.error}`); process.exit(2); }
  const m = medirRecortes({ recortes: r.recortes, partidas: c.filas.map((f) => f.d).filter(Boolean) });
  console.log(informeLector(m));
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(m, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

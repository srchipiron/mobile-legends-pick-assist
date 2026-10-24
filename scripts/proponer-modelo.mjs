#!/usr/bin/env node
/**
 * ¿Hay que recalibrar el modelo? (3.72.0, pedido por Javi: «que se siga
 * actualizando… que me lo proponga primero»).
 *
 * Cada semana, tras las partidas pro, `modelo.yml` corre esto con TODAS las
 * partidas con resultado que hay: las profesionales de 120 días y las de
 * Gloria (las tuyas de historial/partidas.json y las de la base de datos de
 * la comunidad, con su draft completo). Compara, con la misma validación
 * cruzada que `ajustar-modelo.mjs`, el modelo de HOY (la escala del código)
 * con el de la escala vuelta a medir. Solo PROPONE si la medida nueva:
 *  - tiene al menos `MINIMO_PROPUESTA` partidas,
 *  - mejora la verosimilitud fuera de muestra en `MEJORA_MINIMA` por 1.000
 *    partidas o más (por debajo de ~2 no se distingue nada, ver
 *    ajustar-modelo.mjs), y
 *  - cae a más de dos errores típicos de la del código.
 * Nunca toca el código: escribe el informe, y el workflow abre (o comenta)
 * una incidencia. Lo aplica una persona, midiendo antes como siempre.
 *
 *   node scripts/proponer-modelo.mjs [--comunidad /tmp/comunidad.json] [--json f.json] [--dias 120]
 *
 * OJO con lo que mide: los términos salen de las matrices de HOY, no de las
 * del día de cada partida (es lo que hay guardado), y las de Gloria son del
 * equipo del que apuntó la partida contra el otro.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nombreClave } from '../src/motor/nombres.js';
import { fundirCatalogo } from '../src/motor/catalogo.js';
import { ESCALA, PESO_EQUILIBRIO_DANO } from '../src/motor/modelo.js';
import { cargar, terminosDe, validar } from './ajustar-modelo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Partidas mínimas para proponer: con menos, el ± de la escala es más grande que lo que se movería. Decisión de producto. */
export const MINIMO_PROPUESTA = 300;
/** Ganancia mínima de log-verosimilitud fuera de muestra, por 1.000 partidas (ajustar-modelo.mjs: menos de ~2 no distingue nada). */
export const MEJORA_MINIMA = 2;

/**
 * Una partida de Gloria (forma de registro.js) a la forma de las pro: los dos
 * equipos con sus héroes y quién ganó. Solo con el draft COMPLETO (tu pick,
 * cuatro compañeros y cinco enemigos, todos del catálogo y sin repetir): un
 * draft a medias no se puede puntuar como las pro. null si no vale.
 */
export function partidaDeGloria(p, indice) {
  if (!p || p.previa || typeof p.gane !== 'boolean' || typeof p.pick !== 'string') return null;
  const nombres = [[p.pick, ...(p.draft?.aliados ?? [])], p.draft?.enemigos ?? []];
  if (nombres[0].length !== 5 || nombres[1].length !== 5) return null;
  const equipos = nombres.map((l) => l.map((n) => (typeof n === 'string' ? indice.get(nombreClave(n)) ?? null : null)));
  if (!equipos.flat().every(Boolean) || new Set(equipos.flat().map((h) => h.name)).size !== 10) return null;
  return { equipos, ganador: p.gane ? 1 : 2, t: p.t };
}

/**
 * Las partidas de Gloria de todas partes, sin repetir: la misma partida está
 * en tu historial y en la comunidad (mismo instante y pick). `desde` en ms.
 */
export function juntarGloria({ mias = [], comunidad = [], desde = 0 }) {
  const vistas = new Set();
  const todas = [];
  for (const p of [...mias, ...comunidad.map((f) => f?.d)]) {
    if (!p || !Number.isFinite(p.t) || p.t < desde) continue;
    const k = `${p.t}|${p.pick}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    todas.push(p);
  }
  return todas;
}

/** El modelo de la app sobre una partida: una sola pendiente sobre H+C+S+peso·D, sin intercepto (la app no sabe el lado). */
const covariable = (f) => [f.H + f.C + f.S + PESO_EQUILIBRIO_DANO * f.D];

/** La escala de hoy contra la vuelta a medir, en una muestra. null sin partidas. */
export function medirMuestra(filas, escala = ESCALA) {
  if (!filas.length) return null;
  const actual = validar(filas, covariable, { conIntercepto: false, fijo: [escala] });
  const nueva = validar(filas, covariable, { conIntercepto: false });
  return {
    n: filas.length,
    escala: nueva.ajuste?.b?.[0] ?? null,
    se: nueva.ajuste?.se?.[0] ?? null,
    logLActual: actual.cv.logL / filas.length,
    logLNueva: nueva.cv.logL / filas.length,
    ganancia: ((nueva.cv.logL - actual.cv.logL) / filas.length) * 1000,
    aucActual: actual.cv.auc,
    aucNueva: nueva.cv.auc,
  };
}

/**
 * La decisión: con las muestras medidas, ¿se propone? Mira la muestra de
 * TODAS juntas (pro y Gloria); las otras dos se enseñan para ver si tiran
 * hacia el mismo lado.
 */
export function decidirPropuesta(muestras, { escala = ESCALA, minimo = MINIMO_PROPUESTA, mejora = MEJORA_MINIMA } = {}) {
  const m = muestras.juntas;
  if (!m || m.escala == null || m.se == null) return { proponer: false, motivo: 'sin partidas que medir' };
  if (m.n < minimo) return { proponer: false, motivo: `pocas partidas (${m.n} de ${minimo})` };
  if (m.ganancia < mejora) return { proponer: false, motivo: `la escala nueva no predice mejor (${m.ganancia.toFixed(1)} por 1.000, hace falta ${mejora})` };
  if (Math.abs(m.escala - escala) <= 2 * m.se) return { proponer: false, motivo: `la escala medida (${m.escala.toFixed(2)} ± ${m.se.toFixed(2)}) cabe en el error de la de hoy (${escala})` };
  return { proponer: true, motivo: `la escala medida es ${m.escala.toFixed(2)} ± ${m.se.toFixed(2)} (hoy ${escala}) y predice ${m.ganancia.toFixed(1)} por 1.000 partidas mejor fuera de muestra` };
}

/** El informe en Markdown, para la incidencia y el resumen de la corrida. */
export function informe({ muestras, decision, escala = ESCALA, fecha = null }) {
  const f = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const fila = (nombre, m) => (m ? `| ${nombre} | ${m.n} | ${escala} → ${f(m.escala, 2)} ± ${f(m.se, 2)} | ${f(m.ganancia, 1)} | ${f(m.aucActual)} → ${f(m.aucNueva)} |` : `| ${nombre} | 0 | — | — | — |`);
  return [
    decision.proponer ? '## Propuesta: recalibrar la escala del modelo' : '## El modelo de hoy sigue valiendo',
    '',
    `${decision.proponer ? 'Se propone' : 'No se propone nada'}: ${decision.motivo}.${fecha ? ` Datos del ${fecha}.` : ''}`,
    '',
    '| Partidas | n | Escala | Mejora (por 1.000) | AUC |',
    '|---|---|---|---|---|',
    fila('Pro (120 días)', muestras.pro),
    fila('Gloria (tuyas y de la comunidad)', muestras.gloria),
    fila('Todas', muestras.juntas),
    '',
    decision.proponer
      ? 'Nada se ha cambiado. Antes de aplicarlo hay que medirlo como siempre (`node scripts/ajustar-modelo.mjs`, agente `medidor-motor`): cuánto cambia el nº1, y que la mejora aguante con otras semillas de la partición. Si se aplica, sube `VERSION_MODELO`.'
      : 'Se vuelve a medir cada semana con las partidas nuevas.',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const dias = Number(opt('--dias')) || 120;
  const { usables, ctx, meta } = await cargar(dias);
  const filasPro = usables.map((p) => terminosDe(p, ctx));
  const cat = JSON.parse(await readFile(resolve(ROOT, 'public/data/heroes.json'), 'utf8'));
  const indice = new Map(fundirCatalogo(cat.heroes, meta.heroes ?? []).map((h) => [nombreClave(h.name), h]));
  const rutaMias = resolve(ROOT, 'historial/partidas.json');
  const mias = existsSync(rutaMias) ? (JSON.parse(await readFile(rutaMias, 'utf8')).partidas ?? []) : [];
  const rutaComunidad = opt('--comunidad');
  const comunidad = rutaComunidad && existsSync(rutaComunidad) ? (JSON.parse(await readFile(rutaComunidad, 'utf8')).filas ?? []) : [];
  const desde = Date.now() - dias * 86400e3;
  const gloria = juntarGloria({ mias, comunidad, desde }).map((p) => partidaDeGloria(p, indice)).filter(Boolean);
  const filasGloria = gloria.map((p) => terminosDe(p, ctx));
  const muestras = { pro: medirMuestra(filasPro), gloria: medirMuestra(filasGloria), juntas: medirMuestra([...filasPro, ...filasGloria]) };
  const decision = decidirPropuesta(muestras);
  console.log(informe({ muestras, decision, fecha: meta.generatedAt?.slice(0, 10) ?? null }));
  if (opt('--json')) await writeFile(opt('--json'), JSON.stringify({ muestras, decision, escala: ESCALA }));
}

const ejecutadoDirectamente = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ejecutadoDirectamente) main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });

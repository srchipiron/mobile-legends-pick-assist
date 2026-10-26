#!/usr/bin/env node
/**
 * ¿Va bien Lector MLBB en la tablet? (3.74.0, pedido por Javi: «que puedas
 * ver en tiempo real o mediante un log que todo está funcionando bien… para
 * no estar todo el rato con "mejora, revisa…"»).
 *
 * Cada tablet sube un PARTE cada 15 minutos a la base de datos de partidas
 * (`subir_parte`, con su clave de jugador): lo de /estado, el fallo de Node de
 * la última vez y las últimas líneas de su registro, limpias. Esto los baja
 * (`partes_recientes`, sin huellas) y dice, para cada lector, lo que falla
 * (FALLO) y lo que conviene mirar (AVISO). Lo corre la revisión programada de
 * Claude y se puede correr a mano:
 *
 *   node scripts/revisar-tablet.mjs [--horas 48] [--json f.json]
 *
 * Sale con 1 si hay algún FALLO, para que quien lo corra no tenga que leer.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanearConfig, bajarPartes } from '../src/app/basedatos.js';
import { LINEA_DE_ERROR } from './lector/en-tablet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Un parte con más de esto sin llegar, con la tablet leyendo, es raro (llegan cada 15 min). */
export const PARTE_CALLADO_MIN = 45;
/** Más capturas fallidas que esto (sobre las lecturas) es que algo va mal con la grabación. */
export const FALLOS_DE_CAPTURA_MAX = 0.2;
/** Datos del juego más viejos que esto: decide con un meta que ya no es el de hoy. */
export const DATOS_VIEJOS_H = 72;

/** La APK escribe salud.json cada 15 s; con más de esto sin escribir y grabando, su hilo de salud murió o la app está colgada. */
export const SALUD_CALLADA_MIN = 5;

/** Lo que se registra como «No se pudo» pero es el uso, no un fallo: la tablet sin grabar (el modo solo lo intenta igual). */
export const NO_ES_FALLO = /no está grabando la pantalla/;
/** Un fallo de Node de un arranque anterior se avisa durante esto; después ya es historia. */
export const FALLO_ANTERIOR_H = 24;

/** Los motivos de cierre de Salidas.kt que son un fallo (su `FALLOS`): una prueba los compara con el fichero. */
export const CIERRE_POR_FALLO = /falta de memoria|fallo de la app|fallo del lector|dejó de responder|por gastar demasiado|la cerró el sistema|se cerró ella misma/;

/** Lo que dice un parte (el más reciente de un lector), en fallos y avisos. */
export function revisarParte(parte, { ahora = Date.now() } = {}) {
  const fallos = [], avisos = [];
  const d = parte?.d ?? {};
  const e = d.estado ?? {};
  const t = e.tablet ?? {};
  const lector = e.lector ?? {};
  const recibido = Date.parse(parte?.recibido ?? '');
  const minutos = Number.isFinite(recibido) ? Math.round((ahora - recibido) / 60000) : null;
  if (d.falloNodo) {
    // fallo-nodo.txt se queda en la tablet: uno de antes de este arranque ya se superó (3.74.5; el
    // primer parte de verdad traía el del 25 de octubre, arreglado en 3.72.4, como FALLO).
    const linea = String(d.falloNodo).split('\n')[0].slice(0, 200);
    const cuandoFallo = Date.parse(linea.split(' ')[0]);
    const arranque = Number.isFinite(d.cuando) && Number.isFinite(lector.minutos) ? d.cuando - lector.minutos * 60000 : null;
    if (!Number.isFinite(cuandoFallo) || arranque == null || cuandoFallo >= arranque - 60000) fallos.push(`el lector tuvo un error sin recoger: ${linea}`);
    else if (arranque - cuandoFallo < FALLO_ANTERIOR_H * 3600000) avisos.push(`el lector se cayó en el arranque anterior y desde entonces va: ${linea}`);
  }
  // Los cierres que son un fallo: los mismos textos que `FALLOS` de Salidas.kt (no «la cerraste tú» ni «se actualizó»).
  if (e.salida && CIERRE_POR_FALLO.test(e.salida)) avisos.push(`Android la cerró: ${e.salida.slice(0, 200)}`);
  // Los errores van aparte (`errores`, de todo el registro) y en las últimas líneas: sin repetir.
  const errores = [...new Set([...(Array.isArray(d.errores) ? d.errores : []), ...(Array.isArray(d.log) ? d.log : [])].filter((l) => typeof l === 'string' && LINEA_DE_ERROR.test(l) && !NO_ES_FALLO.test(l)))];
  if (errores.length) fallos.push(`errores en el registro (${errores.length}): ${errores.slice(-3).map((l) => l.slice(0, 160)).join(' | ')}`);
  // Las del móvil y las del modo solo (3.74.3: van aparte en /estado).
  const lecturas = (lector.lecturas ?? 0) + (lector.lecturasSolo ?? 0);
  if (lecturas > 10 && lector.fallosCaptura / lecturas > FALLOS_DE_CAPTURA_MAX) avisos.push(`fallan ${lector.fallosCaptura} de ${lecturas} capturas${lector.ultimoFallo?.que ? ` (${String(lector.ultimoFallo.que).slice(0, 120)})` : ''}`);
  if (t.memoriaBaja) avisos.push(`la tablet va justa de memoria (${t.memoriaLibreMB ?? '?'} MB libres; la app usa ${t.memoriaAppMB ?? '?'} MB)`);
  if (t.bateriaLibre === false) avisos.push('el ahorro de batería puede cerrar la app con el juego delante');
  if (t.burbuja === false) avisos.push('la burbuja no tiene permiso');
  else if (t.grabando && /no llega|no deja|no contesta/.test(t.burbujaEstado ?? '')) fallos.push(`la burbuja no sale: ${t.burbujaEstado}`);
  if (e.solo && !e.solo.activo) avisos.push('el modo «Sin móvil» está apagado o sin línea: la tablet no decide sola');
  const fecha = Date.parse(e.datos?.fecha ?? '');
  if (e.datos && !Number.isFinite(fecha)) avisos.push('la tablet no tiene datos del juego válidos: decide sin estadísticas');
  if (Number.isFinite(fecha) && (ahora - fecha) / 3600000 > DATOS_VIEJOS_H) avisos.push(`datos del juego de hace ${Math.round((ahora - fecha) / 3600000)} h${e.datos.de === 'apk' ? ' (los de la APK: no consigue bajar los nuevos)' : ''}`);
  if (e.partidas?.sinSubir > 0 && !e.partidas.clave) avisos.push(`${e.partidas.sinSubir} partidas solo en la tablet: falta la clave de jugador`);
  else if (e.partidas?.sinSubir > 0 && e.partidas.error) avisos.push(`${e.partidas.sinSubir} partidas sin subir (${e.partidas.error})`);
  if (e.pendiente?.pregunta) avisos.push('hay una partida esperando a que digas cómo acabó');
  const salud = Number.isFinite(t.cuando) && Number.isFinite(d.cuando) ? (d.cuando - t.cuando) / 60000 : null; // los dos con el reloj de la tablet
  if (t.grabando && salud != null && salud > SALUD_CALLADA_MIN) avisos.push(`la APK no escribe su estado desde hace ${Math.round(salud)} min con la tablet grabando: lo de la tablet puede ser viejo o estar colgada`);
  if (d.recortado) avisos.push('el parte llegó recortado: el registro o el fallo eran demasiado largos');
  if (minutos != null && minutos > PARTE_CALLADO_MIN && t.grabando) avisos.push(`el último parte es de hace ${minutos} min con la tablet grabando: ¿se cerró?`);
  return { fallos, avisos, minutos, apk: t.apk ?? null, grabando: !!t.grabando, lecturas: lecturas };
}

/** Todos los partes: el más reciente de cada lector, revisado. */
export function revisarPartes(partes, { ahora = Date.now() } = {}) {
  const ultimo = new Map();
  for (const p of Array.isArray(partes) ? partes : []) {
    const t = Date.parse(p?.recibido ?? '');
    if (!Number.isFinite(t) || !Number.isFinite(p?.j)) continue;
    if (!ultimo.has(p.j) || t > Date.parse(ultimo.get(p.j).recibido)) ultimo.set(p.j, p);
  }
  const lectores = [...ultimo.entries()].map(([j, p]) => ({ j, ...revisarParte(p, { ahora }) }));
  return { lectores, fallos: lectores.reduce((n, l) => n + l.fallos.length, 0), avisos: lectores.reduce((n, l) => n + l.avisos.length, 0) };
}

/** El informe en Markdown. */
export function informe(r, { horas = 48 } = {}) {
  if (!r.lectores.length) return `## Lector MLBB: ningún parte en ${horas} h\n\nNinguna tablet ha subido su parte: o no se ha abierto Lector MLBB en estas horas, o no tiene red, o lleva una APK anterior a la 3.74.1 (hasta entonces solo subía con tu clave de jugador).`;
  const L = [`## Lector MLBB: ${r.fallos ? `${r.fallos} fallo(s)` : 'sin fallos'}${r.avisos ? ` · ${r.avisos} aviso(s)` : ''}`, ''];
  for (const l of r.lectores) {
    L.push(`### Lector ${l.j} · APK ${l.apk ?? '?'} · último parte hace ${l.minutos ?? '?'} min · ${l.grabando ? 'grabando' : 'sin grabar'} · ${l.lecturas} lecturas`);
    for (const f of l.fallos) L.push(`- FALLO: ${f}`);
    for (const a of l.avisos) L.push(`- AVISO: ${a}`);
    if (!l.fallos.length && !l.avisos.length) L.push('- Todo bien.');
    L.push('');
  }
  return L.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const horas = Number(opt('--horas')) || 48;
  const ruta = resolve(ROOT, 'public/comunidad.json');
  const config = existsSync(ruta) ? sanearConfig(JSON.parse(readFileSync(ruta, 'utf8'))) : null;
  if (!config) { console.error('No hay public/comunidad.json válido: sin base de datos no hay partes.'); process.exit(2); }
  const b = await bajarPartes(config, { horas });
  if (b.error) { console.error(`La base de datos contestó: ${b.error}${b.error === 'otro' ? ' (¿falta pegar el esquema de 3.74.0 en Supabase?)' : ''}`); process.exit(2); }
  const r = revisarPartes(b.partes);
  console.log(informe(r, { horas }));
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ ...r, partes: b.partes }));
  process.exit(r.fallos ? 1 : 0);
}

const ejecutadoDirectamente = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ejecutadoDirectamente) main().catch((e) => { console.error(e.stack ?? e.message); process.exit(2); });

/**
 * Las opciones de la ingesta y el contexto de una corrida: lo que se lee de
 * la línea de órdenes, las rutas descubiertas y la base que respondió. Nada
 * aquí se lee al importar: `main` crea el contexto y lo pasa.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RANGO_DE_RESPALDO } from '../../src/motor/ventana.js';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const UA = 'mobile-legends-pick-assist (uso personal)';
/** Tope de cada petición a la API y de cada imagen [D]. */
export const TIMEOUT_MS = 15000;
/** La ventana de stats, cruces, parejas y `tocados` (cruces sin medir a menos) [M]. */
export const DIAS = 7;
/** La ventana corta de la fuerza: a 3 días el ruido queda 12 veces bajo la señal; a 1, héroes al 0 y al 100 % [M]. */
export const DIAS_RECIENTES = 3;

/**
 * Bases conocidas, de la más actual a la más antigua [D]. Con `--base` o
 * `MLBB_API_BASE` se usa esa y SOLO esa (una prueba no puede salir a la red).
 */
export const BASES = [
  'https://arena-hv.fastapicloud.dev/api',
  'https://arena.rone.dev/api',
  'https://api-mobilelegends.vercel.app/api',
];
/** Prefijos de grupo que ha usado la API, para el camino sin esquema [D]. */
export const PREFIJOS = ['/heroes', '', '/mlbb'];
const TIERS = 'https://back.mlbb.gg/api/v1';

/** `--k v`; un valor que empieza por `--` NO es valor (`--out --iconos x`) [C]. */
export function parseArgs(argv) {
  const out = {};
  argv.forEach((cur, i) => {
    if (!cur.startsWith('--')) return;
    const v = argv[i + 1];
    out[cur.slice(2)] = v != null && !String(v).startsWith('--') ? v : true;
  });
  return out;
}

const texto = (v) => typeof v === 'string';
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Las opciones de una corrida. Workflows y pruebas escriben SIEMPRE a un
 * temporal (`--out`): la ingesta sobre public/data publicó corridas
 * degradadas [C].
 */
export function leerOpciones(argv = process.argv.slice(2), env = process.env) {
  const a = parseArgs(argv);
  const rank = texto(a.rank) ? a.rank : 'glory';
  const ranks = (texto(a.ranks) ? a.ranks : 'epic,legend,mythic,glory').split(',').map((r) => r.trim()).filter(Boolean);
  // El pedido y su respaldo se bajan siempre: deciden la fecha y la guarda de rango [C].
  if (!ranks.includes(rank)) ranks.push(rank);
  const respaldo = RANGO_DE_RESPALDO[rank] ?? null;
  if (respaldo && !ranks.includes(respaldo)) ranks.unshift(respaldo);
  const fija = a.base ?? env.MLBB_API_BASE;
  const dias = numero(a.days);
  return {
    out: resolve(RAIZ, texto(a.out) ? a.out : 'public/data/roam-meta.json'),
    previo: texto(a.previo) ? resolve(RAIZ, a.previo) : null,
    iconos: resolve(RAIZ, texto(a.iconos) ? a.iconos : 'public/objetos'),
    retratos: resolve(RAIZ, texto(a.retratos) ? a.retratos : 'public/heroes'),
    rank,
    respaldo,
    ranks,
    dias: dias > 0 ? dias : DIAS,
    // Solo la simulación: tiene tres héroes y no llega a las celdas de la guarda de rango [C].
    celdas: numero(a['celdas-para-comparar']),
    bases: fija ? [fija] : BASES,
    // mlbb.gg aparte; con la base fijada se apaga sola [C].
    tiers: a.tiers === 'off' ? null : texto(a.tiers) ? a.tiers.replace(/\/$/, '') : fija ? null : TIERS,
    // `--pausa N` sustituye TODA espera, también los reintentos (las pruebas usan 0) [C].
    pausa: a.pausa != null ? Number(a.pausa) : null,
  };
}

/**
 * El estado de una corrida: las opciones, las rutas del esquema (o null), la
 * base fijada por el camino sin esquema y los fallos de red para el
 * diagnóstico (`failed`).
 */
export function crearContexto(op) {
  return {
    op,
    rutas: null,
    fijada: null,
    fallos: [],
    sleep: (ms) => new Promise((r) => setTimeout(r, op.pausa ?? ms)),
  };
}

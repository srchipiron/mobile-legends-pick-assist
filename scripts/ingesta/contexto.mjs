/**
 * Contexto compartido de la ingesta: los argumentos de la linea de ordenes ya
 * leidos, las constantes que salen de ellos y el estado que escriben todos los
 * modulos (el diagnostico, la base que respondio y las rutas descubiertas).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Dos niveles: este fichero vive en scripts/ingesta/, no en scripts/.
export const ROOT = resolve(__dirname, '../..');
// `--out --iconos /tmp/x` daba `{ out: '--iconos' }`: un valor que empieza
// por `--` no es un valor.
export function parseArgs(argv) {
  return Object.fromEntries(argv.reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const v = arr[i + 1];
      acc.push([cur.slice(2), v != null && !String(v).startsWith('--') ? v : true]);
    }
    return acc;
  }, []));
}
export const args = parseArgs(process.argv.slice(2));

// --out escribe en otro sitio. Lo usa la prueba que ejecuta esta ingesta de
// verdad: sin ello sobrescribia public/data con una corrida contra una base
// inalcanzable, y como las pruebas corren antes de compilar, ese diagnostico
// degradado era el que se publicaba.
export const OUT = resolve(ROOT, typeof args.out === 'string' ? args.out : 'public/data/roam-meta.json');
export const HEROES = resolve(ROOT, 'public/data/heroes.json');

// Donde se guardan los iconos de los objetos. Mismo motivo que --out: la prueba
// que ejecuta la ingesta de verdad le pasa un temporal, para no ensuciar el
// repositorio ni dejarlo a medias si la corrida sale mal.
export const ICONOS = resolve(ROOT, typeof args.iconos === 'string' ? args.iconos : 'public/objetos');
export const RETRATOS = resolve(ROOT, typeof args.retratos === 'string' ? args.retratos : 'public/heroes');
// `--previo`: de dónde leer «lo anterior». Solo para pruebas (ver abajo).
export const PREVIO = typeof args.previo === 'string' ? resolve(ROOT, args.previo) : null;

// Gloria Mitica por defecto: es el rango del usuario y donde el draft se juega
// en serio, asi que sus counters son los mas informativos.
export const RANK = typeof args.rank === 'string' ? args.rank : 'glory';
export const DAYS = Number.isFinite(Number(args.days)) && Number(args.days) > 0 ? Number(args.days) : 7;
// La ventana CORTA, solo para las estadisticas por heroe: una media de 7 dias
// tarda una semana en recoger un parche. 3 y no 1 porque esta medido con la
// misma ruta y la misma poblacion (src/motor/ventana.js): a 3 dias el ruido
// queda 12 veces por debajo de la dispersion entre heroes; a 1 dia la ruta
// devuelve heroes al 0% y al 100% (r = 0,09 con la de 7).
export const DIAS_RECIENTES = 3;
export const RANKS = (typeof args.ranks === 'string' ? args.ranks : 'epic,legend,mythic,glory').split(',').map((r) => r.trim()).filter(Boolean);
// El rango pedido se descarga siempre: fuera de la lista, `estadisticasNuevas`
// era falso para siempre y la fecha del fichero no avanzaba jamás.
if (!RANKS.includes(RANK)) RANKS.push(RANK);

/**
 * Bases conocidas, de la más actual a la más antigua.
 *
 * Si se pasa una a mano (--base o MLBB_API_BASE) se usa ESA Y SOLO ESA. Antes
 * se ponía la primera y se seguía cayendo a las demás, así que la prueba que
 * dice correr "contra una base inalcanzable" hacía en realidad una ingesta
 * completa contra la API de verdad: tardaba más de un minuto, dependía de la
 * red y disparaba cuarenta peticiones en cada despliegue.
 */
const BASE_FIJADA = args.base ?? process.env.MLBB_API_BASE;
// La tier list de mlbb.gg (scripts/ingesta/tiers.mjs) tiene su propia base:
// `--tiers <base>` la cambia, `--tiers off` la apaga, y con la base principal
// fijada (pruebas, local) se apaga sola para que una prueba no salga a internet.
export const TIERS = args.tiers === 'off' ? null
  : (typeof args.tiers === 'string' ? args.tiers.replace(/\/$/, '') : (BASE_FIJADA ? null : 'https://back.mlbb.gg/api/v1'));
export const BASES = BASE_FIJADA ? [BASE_FIJADA] : [
  'https://arena-hv.fastapicloud.dev/api',   // responde: /heroes/hero-rank/ existe
  'https://arena.rone.dev/api',
  'https://api-mobilelegends.vercel.app/api', // legado
];

/** Prefijos de grupo de rutas que ha usado el proyecto en distintas versiones. */
// '/heroes' confirmado: da 405 (existe, otro método) mientras '/mlbb' da 404.
export const PREFIXES = ['/heroes', '', '/mlbb'];

export const UA = 'mobile-legends-pick-assist (uso personal)';
export const TIMEOUT_MS = 15000;

export const diagnostics = { bases: BASES, ok: [], failed: [] };

/**
 * Lo que la ingesta va fijando por el camino. Va en un objeto porque un binding
 * importado no se puede reasignar desde otro modulo, y estos dos los escribe
 * quien descubre las rutas y quien hace la primera peticion que responde.
 */
export const estado = {
  /** { base, prefix, method } en cuanto algo responde */
  LOCKED: null,
  /** Rutas descubiertas en el esquema OpenAPI. La rellena discoverRoutes(). */
  ROUTES: null,
};

// Las esperas entre peticiones son cortesia con una API gratuita. `--pausa 0`
// las quita: lo usa la prueba que ejecuta la ingesta entera contra una API
// simulada en local, donde 133 esperas de 250 ms serian medio minuto de nada.
const PAUSA_MS = args.pausa != null ? Number(args.pausa) : null;
export const sleep = (ms) => new Promise((r) => setTimeout(r, PAUSA_MS ?? ms));

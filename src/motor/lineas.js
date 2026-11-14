import { nombreClave } from './nombres.js';
import { LINEAS } from './catalogo.js';

/**
 * Las líneas: en cuáles se juega cada héroe (dato de la API), qué líneas ocupa ya
 * un equipo y quién es el rival de la tuya. Los roles típicos de cada línea se
 * cuentan del propio listado: si el meta cambia, esto se entera solo.
 */

/** Las líneas de un héroe tal como las da la API (array o `lane` en cadena), en minúsculas. */
export function lanesDe(h) {
  if (Array.isArray(h?.lanes)) return h.lanes.map((l) => String(l).toLowerCase().trim()).filter(Boolean);
  return String(h?.lane ?? '').toLowerCase().split(/[,/|]/).map((l) => l.trim()).filter(Boolean);
}

/** Con qué frecuencia cada rol juega cada línea: `{linea: {rol: 0..1}}`. */
export function frecuenciaDeRoles(apiHeroes = []) {
  const cuenta = {};
  for (const h of apiHeroes) {
    const rol = String(h?.role ?? '').toLowerCase();
    if (!rol) continue;
    for (const l of lanesDe(h)) (cuenta[l] ??= {})[rol] = (cuenta[l][rol] ?? 0) + 1;
  }
  const salida = {};
  for (const [linea, roles] of Object.entries(cuenta)) {
    const total = Object.values(roles).reduce((a, b) => a + b, 0) || 1;
    salida[linea] = Object.fromEntries(Object.entries(roles).map(([rol, n]) => [rol, n / total]));
  }
  return salida;
}

/** Mapa clave → `{role, lanes}` de los datos de la API. */
export function indiceDeLineas(apiHeroes = []) {
  const mapa = new Map();
  for (const h of apiHeroes) if (h?.name) mapa.set(nombreClave(h.name), { role: String(h.role ?? '').toLowerCase(), lanes: lanesDe(h) });
  return mapa;
}

/** [M] Peso de que el rol sea típico de la línea (1.600 drafts: a 0,10 cero rivales equivocados; a 0,30, 1,3–2,7 %). */
const ROL_TIPICO = 0.10;

/** Cuánto encaja un héroe en una línea. Solo tiene que ORDENAR. */
export function probabilidadDeLinea(heroe, info, linea, frecuencias = {}) {
  const lanes = info?.lanes ?? [];
  // `||`: el índice guarda '' sin rol de la API, y con `??` tapaba el del catálogo.
  const rol = (info?.role || heroe?.role || '').toLowerCase();
  let p = 0;
  if (lanes.includes(linea)) p += 0.6 + 0.25 / Math.max(1, lanes.length);
  const frec = frecuencias[linea] ?? {};
  const suya = frec[rol] ?? 0;
  const maxima = Math.max(0, ...Object.values(frec));
  if (maxima > 0) p += (suya / maxima) * ROL_TIPICO - (suya === 0 ? 0.25 : 0);
  // Sin datos de la API: solo el catálogo escrito a mano sabe quién hace roam.
  if (!lanes.length && maxima === 0 && linea === 'roam') {
    if (heroe?.roam) p += 0.45;
    if (rol === 'tank' || rol === 'support') p += 0.2;
    if (heroe?.tags?.includes('hypercarry')) p -= 0.3;
  }
  return p;
}

/** [M] Ventaja del mejor reparto sobre el mejor con OTRO en tu línea para nombrar rival (1.500 drafts: 94 % de precisión de 0,15 a 0,30). */
export const MARGEN_PARA_HABLAR = 0.20;
/** [M] Un rival que encaja en tu línea por debajo de esto no se nombra. */
const ENCAJE_MINIMO = 0.3;

function permutaciones(arr) {
  if (arr.length <= 1) return [arr];
  const salida = [];
  for (let i = 0; i < arr.length; i++) {
    const resto = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutaciones(resto)) salida.push([arr[i], ...p]);
  }
  return salida;
}

function combinaciones(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [x, ...r] = arr;
  return [...combinaciones(r, k - 1).map((c) => [x, ...c]), ...combinaciones(r, k)];
}

const cacheDeRepartos = new WeakMap();

/**
 * TODOS los repartos de `equipo` en `candidatas` (una línea por cabeza), con su
 * total, en un orden fijo (combinaciones y luego permutaciones): el desempate es
 * siempre el primero. Es el único recorrido; un toque lo pide varias veces y se
 * guarda por índice, frecuencias y equipo.
 */
function repartos(equipo, info, frecuencias, candidatas) {
  let porInfo = cacheDeRepartos.get(info);
  if (!porInfo) cacheDeRepartos.set(info, porInfo = new WeakMap());
  let cache = porInfo.get(frecuencias);
  if (!cache) porInfo.set(frecuencias, cache = new Map());
  const clave = `${equipo.map((h) => h.name).join('|')}#${candidatas.join(',')}`;
  if (cache.has(clave)) return cache.get(clave);
  const P = equipo.map((h) => {
    const datos = info.get(nombreClave(h.name));
    return Object.fromEntries(candidatas.map((l) => [l, probabilidadDeLinea(h, datos, l, frecuencias)]));
  });
  const lista = [];
  for (const lineas of combinaciones(candidatas, Math.min(equipo.length, candidatas.length))) {
    for (const perm of permutaciones(lineas)) lista.push({ perm, total: perm.reduce((acc, l, i) => acc + P[i][l], 0) });
  }
  const salida = { P, lista };
  if (cache.size > 500) cache.clear();
  cache.set(clave, salida);
  return salida;
}

/** El primero de máximo total entre los que cumplan `filtro`. */
const mejorDe = (lista, filtro = () => true) => lista.reduce((mejor, r) => (filtro(r) && (!mejor || r.total > mejor.total) ? r : mejor), null);

/**
 * Qué línea ocupa cada uno del equipo (en su orden) según el mejor reparto
 * conjunto. `candidatas` reparte a tus aliados sin tu línea.
 */
export function lineasOcupadas(equipo, info = new Map(), frecuencias = {}, candidatas = LINEAS) {
  if (!equipo?.length || !candidatas.length) return [];
  const mejor = mejorDe(repartos(equipo, info, frecuencias, candidatas).lista);
  return mejor ? [...mejor.perm] : [];
}

/**
 * El rival de tu línea: reparte a TODOS los enemigos a la vez y se queda con el
 * mejor reparto. null si nadie cae en tu línea, si el mejor reparto con OTRO en
 * ella queda a menos de `margen`, o si el elegido apenas encaja ahí.
 */
export function detectarRivalDeLinea(enemigos, info = new Map(), linea = 'roam', frecuencias = {}, margen = MARGEN_PARA_HABLAR) {
  if (!enemigos?.length || !linea) return null;
  const { P, lista } = repartos(enemigos, info, frecuencias, LINEAS);
  const quien = (r) => r.perm.indexOf(linea);
  const mejor = mejorDe(lista);
  if (!mejor || quien(mejor) < 0) return null;
  const conOtro = mejorDe(lista, (r) => quien(r) !== quien(mejor));
  if (conOtro && mejor.total - conOtro.total < margen) return null;
  if (P[quien(mejor)][linea] <= ENCAJE_MINIMO) return null;
  return enemigos[quien(mejor)].name;
}

/** Mejor reparto de cinco héroes en las cinco líneas, `{linea: héroe}` (scripts de medición). */
export function asignarLineas(equipo, info, frecuencias) {
  const mejor = mejorDe(repartos(equipo, info, frecuencias, LINEAS).lista);
  return Object.fromEntries(mejor.perm.map((l, i) => [l, equipo[i]]));
}

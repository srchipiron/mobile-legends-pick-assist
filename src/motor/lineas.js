import { nombreClave } from './nombres.js';
import { LINEAS } from './catalogo.js';

/**
 * Las líneas: en cuáles se juega cada héroe (dato de la API), qué líneas
 * ocupan ya los enemigos elegidos y quién es el rival de la tuya.
 *
 * Los roles típicos de cada línea NO están escritos a mano: se cuentan del
 * propio listado, así que si el meta cambia, esto se entera solo.
 */

/** Las líneas de un héroe tal como las da la API (array o `lane` en cadena), en minúsculas. */
export function lanesDe(h) {
  if (Array.isArray(h?.lanes)) return h.lanes.map((l) => String(l).toLowerCase().trim()).filter(Boolean);
  return String(h?.lane ?? '').toLowerCase().split(/[,/|]/).map((l) => l.trim()).filter(Boolean);
}

/** Con qué frecuencia cada rol juega cada línea: { linea: { rol: 0..1 } }. */
export function frecuenciaDeRoles(apiHeroes = []) {
  const cuenta = {};
  for (const h of apiHeroes) {
    const rol = String(h?.role ?? '').toLowerCase();
    if (!rol) continue;
    for (const l of lanesDe(h)) { (cuenta[l] ??= {})[rol] = (cuenta[l][rol] ?? 0) + 1; }
  }
  const salida = {};
  for (const [linea, roles] of Object.entries(cuenta)) {
    const total = Object.values(roles).reduce((a, b) => a + b, 0) || 1;
    salida[linea] = Object.fromEntries(Object.entries(roles).map(([rol, n]) => [rol, n / total]));
  }
  return salida;
}

/** Mapa clave → { role, lanes } a partir de los datos de la API. */
export function indiceDeLineas(apiHeroes = []) {
  const mapa = new Map();
  for (const h of apiHeroes) {
    if (!h?.name) continue;
    mapa.set(nombreClave(h.name), { role: String(h.role ?? '').toLowerCase(), lanes: lanesDe(h) });
  }
  return mapa;
}

/**
 * Cuánto pesa que el rol sea típico de la línea, frente a que la API diga
 * que juega ahí (0.6 + 0.25/líneas). Medido en 1.600 drafts con la línea
 * conocida: a 0.10, cero rivales equivocados por 1–1,5 puntos de cobertura;
 * a 0.30, 1,3–2,7% de errores. Un rival mal nombrado sale en el análisis
 * como un hecho; callarse no cuesta nada.
 */
const ROL_TIPICO = 0.10;

/** Probabilidad aproximada de que un héroe sea el de esa línea en su equipo. Solo tiene que ORDENAR. */
export function probabilidadDeLinea(heroe, info, linea, frecuencias = {}) {
  const lanes = info?.lanes ?? [];
  const rol = (info?.role ?? heroe?.role ?? '').toLowerCase();
  let p = 0;
  if (lanes.includes(linea)) p += 0.6 + 0.25 / Math.max(1, lanes.length);
  const frec = frecuencias[linea] ?? {};
  const suya = frec[rol] ?? 0;
  const maxima = Math.max(0, ...Object.values(frec));
  if (maxima > 0) p += (suya / maxima) * ROL_TIPICO - (suya === 0 ? 0.25 : 0);
  // Sin datos de la API todavía: solo el catálogo escrito a mano sabe quién hace roam.
  if (!lanes.length && maxima === 0 && linea === 'roam') {
    if (heroe?.roam) p += 0.45;
    if (rol === 'tank' || rol === 'support') p += 0.2;
    if (heroe?.tags?.includes('hypercarry')) p -= 0.3;
  }
  return p;
}

/**
 * Cuánto tiene que ganar el mejor reparto al mejor reparto que ponga a OTRO
 * en tu línea para nombrar a alguien. Medido en 1.500 drafts por caso: entre
 * 0.15 y 0.30 la precisión con draft completo no se mueve (94%); a medias,
 * 0.20 deja de nombrar rivales separados solo por lo típico de su rol sin
 * perder cobertura apreciable.
 */
export const MARGEN_PARA_HABLAR = 0.20;

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

const probabilidades = (equipo, info, candidatas, frecuencias) => equipo.map((h) => {
  const datos = info.get(nombreClave(h.name));
  return Object.fromEntries(candidatas.map((l) => [l, probabilidadDeLinea(h, datos, l, frecuencias)]));
});

/**
 * Qué líneas ocupan ya los enemigos elegidos, según el mejor reparto
 * conjunto (una línea por cabeza). Por las demás van a salir los que faltan.
 * `candidatas` permite repartir a tus aliados sin tu línea.
 */
export function lineasOcupadas(equipo, info = new Map(), frecuencias = {}, candidatas = LINEAS) {
  if (!equipo?.length || !candidatas.length) return [];
  const P = probabilidades(equipo, info, candidatas, frecuencias);
  const n = Math.min(equipo.length, candidatas.length);
  let mejor = null;
  for (const lineas of combinaciones(candidatas, n)) {
    for (const perm of permutaciones(lineas)) {
      const total = perm.reduce((acc, l, i) => acc + P[i][l], 0);
      if (!mejor || total > mejor.total) mejor = { total, perm };
    }
  }
  return mejor ? [...mejor.perm] : [];
}

/**
 * El rival de tu línea entre los enemigos ya elegidos: reparte a TODOS a la
 * vez (eliminación) y se queda con el mejor reparto. Devuelve null si el
 * mejor reparto que pone a otro en tu línea queda a menos de `margen`, o si
 * el elegido no encaja ahí. Con draft a medias, callarse es lo correcto.
 */
export function detectarRivalDeLinea(enemigos, info = new Map(), linea = 'roam', frecuencias = {}, margen = MARGEN_PARA_HABLAR) {
  if (!enemigos?.length || !linea) return null;
  const P = probabilidades(enemigos, info, LINEAS, frecuencias);
  const n = Math.min(enemigos.length, LINEAS.length);
  let mejor = null; let mejorConOtro = null;
  for (const lineas of combinaciones(LINEAS, n)) {
    for (const perm of permutaciones(lineas)) {
      const total = perm.reduce((s, l, i) => s + P[i][l], 0);
      const quien = perm.indexOf(linea);
      if (!mejor || total > mejor.total) mejor = { total, quien };
    }
  }
  if (!mejor || mejor.quien < 0) return null;
  for (const lineas of combinaciones(LINEAS, n)) {
    for (const perm of permutaciones(lineas)) {
      const quien = perm.indexOf(linea);
      if (quien === mejor.quien) continue;
      const total = perm.reduce((s, l, i) => s + P[i][l], 0);
      if (!mejorConOtro || total > mejorConOtro.total) mejorConOtro = { total, quien };
    }
  }
  if (mejorConOtro && mejor.total - mejorConOtro.total < margen) return null;
  if (P[mejor.quien][linea] <= 0.3) return null;
  return enemigos[mejor.quien].name;
}

/** Mejor reparto de cinco héroes en las cinco líneas: { linea: héroe }. Lo usan los scripts de medición. */
export function asignarLineas(equipo, info, frecuencias) {
  const P = probabilidades(equipo, info, LINEAS, frecuencias);
  let mejor = null;
  for (const perm of permutaciones([...LINEAS])) {
    const total = perm.reduce((s, l, i) => s + P[i][l], 0);
    if (!mejor || total > mejor.total) mejor = { total, perm };
  }
  return Object.fromEntries(mejor.perm.map((l, i) => [l, equipo[i]]));
}

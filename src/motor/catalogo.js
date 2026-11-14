import { nombreClave } from './nombres.js';
import { ROLE_DEFAULTS, SPECIALITY_TAGS, ROLE_VETO } from './reglas.js';

/**
 * El catálogo: `heroes.json` (rol y etiquetas escritas a mano) fundido con la API
 * (id, daño, líneas, speciality y habilidades de los 133). Al héroe que el catálogo
 * aún no conoce se le DEDUCEN etiquetas (`inferred: true`), que el resto del motor
 * descuenta por `PRECISION_DEDUCIDA`.
 */

/** [M] Precisión de las etiquetas deducidas frente a las escritas a mano (derivar-tags.mjs, F1 59 %). */
export const PRECISION_DEDUCIDA = 0.67;
/** [C] Las cinco líneas: su orden es el de recorrido y el del azar de la simulación. */
export const LINEAS = ['roam', 'jungle', 'mid', 'gold', 'exp'];
/** [D] Proporción desde la que un héroe pega de las dos cosas (reparto real de los 133). */
const MIXTO_DESDE = 0.5;

/** 0,67 a un héroe con etiquetas deducidas, 1 al resto. */
export const fiabilidad = (heroe) => (heroe?.inferred ? PRECISION_DEDUCIDA : 1);

/** Las de su rol + lo traducible de su speciality, sin lo que el catálogo dice que nunca le toca a ese rol. */
export function tagsDeducidos(role, speciality = []) {
  const veto = new Set(ROLE_VETO[role] ?? []);
  const porEsp = (speciality ?? []).flatMap((e) => SPECIALITY_TAGS[e] ?? []).filter((t) => !veto.has(t));
  return [...new Set([...(ROLE_DEFAULTS[role] ?? []), ...porEsp])];
}

/**
 * Catálogo + API, por clave normalizada («X.Borg» = «X Borg»). Orden: el de
 * heroes.json y después los de la API que no están. El id y el daño vienen de la
 * API también para los del catálogo (las imágenes van por id).
 */
export function fundirCatalogo(catalogo = [], api = []) {
  const porApi = new Map(api.map((h) => [nombreClave(h.name), h]));
  const deLaApi = (a) => ({ ...(a?.damage ? { damage: a.damage } : {}), ...(a?.id != null ? { id: a.id } : {}), ...(a?.habilidades?.length ? { habilidades: a.habilidades } : {}) });
  const salida = new Map(catalogo.map((h) => [h.name, { ...h, ...deLaApi(porApi.get(nombreClave(h.name))) }]));
  const enCatalogo = new Set(catalogo.map((h) => nombreClave(h.name)));
  for (const a of api) {
    if (!a?.name || enCatalogo.has(nombreClave(a.name))) continue;
    const role = (a.role ?? '').toLowerCase();
    salida.set(a.name, {
      name: a.name,
      ...(a.id != null ? { id: a.id } : {}),
      role,
      tags: tagsDeducidos(role, a.speciality),
      roam: role === 'tank' || role === 'support',
      inferred: true,
      ...(a.damage ? { damage: a.damage } : {}),
      ...(a.habilidades?.length ? { habilidades: a.habilidades } : {}),
    });
  }
  return [...salida.values()];
}

/**
 * Los que juegan una línea según la API (`lanes`; un héroe puede jugar dos). Sin
 * ningún dato de líneas, roam cae a los `roam: true` del catálogo y el resto vacío.
 */
export function poolDeLinea(heroes, indiceLineas, linea) {
  const lanes = (h) => indiceLineas?.get?.(nombreClave(h.name))?.lanes;
  if (!heroes.some((h) => lanes(h)?.length)) return linea === 'roam' ? heroes.filter((h) => h.roam) : [];
  return heroes.filter((h) => lanes(h)?.includes(linea));
}

/** Un carry frágil. Un tanque también lleva `immobile` y no hay que hacerle peel. */
export const hayQueProtegerlo = (heroe) => ['hypercarry', 'poke', 'burst'].some((t) => heroe?.tags?.includes(t)) && !heroe?.tags?.includes('tanky');

/**
 * 'fisico', 'magico', 'mixto' o null, contado en los textos de habilidad (la
 * ingesta), no deducido del rol. Es DATO: no se descuenta por `PRECISION_DEDUCIDA`.
 */
export function tipoDeDano(heroe) {
  const { fisico = 0, magico = 0 } = heroe?.damage ?? {};
  if (!fisico && !magico) return null;
  if (Math.min(fisico, magico) >= Math.max(fisico, magico) * MIXTO_DESDE) return 'mixto';
  return fisico > magico ? 'fisico' : 'magico';
}

/**
 * Lo que cambia cuando REHACEN un kit y no con un reequilibrio de números: tipo de
 * daño, speciality y la huella del texto sin cifras (`kitTexto`, de la ingesta).
 * Avisa de que unas etiquetas escritas a mano se escribieron para otro kit; no se
 * deducen etiquetas por eso.
 */
export function huellaDeKit(heroe) {
  const esp = [...(heroe?.speciality ?? [])].sort().join(',');
  const texto = typeof heroe?.kitTexto === 'string' ? `|${heroe.kitTexto}` : '';
  return `${tipoDeDano(heroe) ?? '?'}|${esp}${texto}`;
}

/** Cuántos de cada tipo, y el que falta (solo con ≥2 con dato y ninguno de ese lado). */
export function perfilDeDano(heroes = []) {
  const tipos = heroes.map(tipoDeDano);
  const cuenta = (t) => tipos.filter((x) => x === t).length;
  const fisico = cuenta('fisico'); const magico = cuenta('magico'); const mixto = cuenta('mixto');
  const conDato = fisico + magico + mixto;
  let falta = null;
  if (conDato >= 2) {
    if (!magico && !mixto) falta = 'magico';
    else if (!fisico && !mixto) falta = 'fisico';
  }
  return { fisico, magico, mixto, sinDato: tipos.length - conDato, falta };
}

/** Un mixto tapa cualquier hueco de daño; uno puro, solo el suyo. */
export function tapaElHueco(heroe, falta) {
  if (!falta) return false;
  const t = tipoDeDano(heroe);
  return t === falta || t === 'mixto';
}

/**
 * E[min(físicos, mágicos)] de un equipo de n héroes (n = 0..5): CENTRA el término
 * de equilibrio con el draft a medias, para que tener más héroes en pantalla no
 * dé más equilibrio. Un equipo real lleva uno por línea: media sobre los
 * subconjuntos de n líneas, con el reparto de cada línea ponderado por cuota de
 * pick (sin dato pesa 0; sin estadísticas, todos 1). Sin líneas, n al azar del
 * total (multinomial). [M] Con el centro multinomial, 1 contra 5 daba el 48,8 %.
 */
export function equilibrioEsperado(heroes = [], stats = null, poolsPorLinea = null) {
  const reparto = (lista) => {
    let pf = 0; let pm = 0; let po = 0;
    for (const h of lista) {
      const w = stats ? (stats[nombreClave(h.name)]?.pickRate ?? 0) : 1;
      const t = tipoDeDano(h);
      if (t === 'fisico') pf += w; else if (t === 'magico') pm += w; else po += w;
    }
    const total = pf + pm + po || 1;
    return [pf / total, pm / total, po / total];
  };
  const lineas = poolsPorLinea ? Object.values(poolsPorLinea).filter((p) => p?.length) : [];
  if (!lineas.length) {
    const [pf, pm, po] = reparto(heroes);
    const fact = [1, 1, 2, 6, 24, 120];
    const esperado = [0];
    for (let n = 1; n <= 5; n++) {
      let e = 0;
      for (let f = 0; f <= n; f++) {
        for (let m = 0; m <= n - f; m++) {
          const o = n - f - m;
          e += (fact[n] / (fact[f] * fact[m] * fact[o])) * pf ** f * pm ** m * po ** o * Math.min(f, m);
        }
      }
      esperado.push(e);
    }
    return esperado;
  }
  const porLinea = lineas.map(reparto);
  const esperado = [0, 0, 0, 0, 0, 0];
  const cuenta = [0, 0, 0, 0, 0, 0];
  for (let mascara = 1; mascara < 1 << porLinea.length; mascara++) {
    let dist = new Map([['0,0', 1]]);
    let n = 0;
    for (let i = 0; i < porLinea.length; i++) {
      if (!(mascara & (1 << i))) continue;
      n += 1;
      const [pf, pm, po] = porLinea[i];
      const siguiente = new Map();
      for (const [clave, p] of dist) {
        const [f, m] = clave.split(',').map(Number);
        for (const [df, dm, q] of [[1, 0, pf], [0, 1, pm], [0, 0, po]]) {
          if (!q) continue;
          const k = `${f + df},${m + dm}`;
          siguiente.set(k, (siguiente.get(k) ?? 0) + p * q);
        }
      }
      dist = siguiente;
    }
    if (n > 5) continue;
    let e = 0;
    for (const [clave, p] of dist) { const [f, m] = clave.split(',').map(Number); e += p * Math.min(f, m); }
    esperado[n] += e; cuenta[n] += 1;
  }
  return esperado.map((e, n) => (cuenta[n] ? e / cuenta[n] : 0));
}

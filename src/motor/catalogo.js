import { nombreClave } from './nombres.js';
import { ROLE_DEFAULTS, SPECIALITY_TAGS, ROLE_VETO } from './reglas.js';

/**
 * El catálogo: los héroes con los que trabaja el motor.
 *
 * `public/data/heroes.json` lleva rol y etiquetas escritas a mano; la API
 * (`roam-meta.json`) lleva id, tipo de daño, líneas y speciality para los
 * 133. `fundirCatalogo` junta las dos cosas y rellena a los héroes que el
 * catálogo aún no conoce con etiquetas DEDUCIDAS (`inferred: true`), que el
 * resto del motor descuenta por `PRECISION_DEDUCIDA`.
 */

/** Precisión medida de las etiquetas deducidas frente a las escritas a mano (derivar-tags.mjs). */
export const PRECISION_DEDUCIDA = 0.67;

/** Las cinco líneas, en el orden en que se leen en el juego. */
export const LINEAS = ['roam', 'jungle', 'mid', 'gold', 'exp'];

/**
 * Etiquetas de un héroe que no está en el catálogo: las de su rol más lo que
 * se pueda traducir de su speciality, sin lo que el catálogo dice que nunca
 * le corresponde a ese rol.
 */
export function tagsDeducidos(role, speciality = []) {
  const porRol = ROLE_DEFAULTS[role] ?? [];
  const veto = new Set(ROLE_VETO[role] ?? []);
  const porEsp = (speciality ?? []).flatMap((e) => SPECIALITY_TAGS[e] ?? []).filter((t) => !veto.has(t));
  return [...new Set([...porRol, ...porEsp])];
}

/**
 * Catálogo escrito a mano + lo que conozca la API. «Ya está en el catálogo»
 * se decide por clave normalizada: con la cruda, «X.Borg» y «X Borg» serían
 * dos héroes. El id y el tipo de daño vienen de la API también para los del
 * catálogo (los retratos van por id, que no cambia aunque cambie el nombre).
 */
export function fundirCatalogo(catalogo = [], api = []) {
  const porApi = new Map(api.map((h) => [nombreClave(h.name), h]));
  const salida = new Map(catalogo.map((h) => {
    const a = porApi.get(nombreClave(h.name));
    return [h.name, { ...h, ...(a?.damage ? { damage: a.damage } : {}), ...(a?.id != null ? { id: a.id } : {}) }];
  }));
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
    });
  }
  return [...salida.values()];
}

/**
 * Héroes que se juegan en una línea, según la API (`lanes`). Un héroe puede
 * estar en dos (31 de 133) y es correcto. Sin datos de líneas, para roam se
 * cae al catálogo escrito a mano, que es el único que marca `roam`; las otras
 * cuatro se quedan vacías y la app lo dice.
 */
export function poolDeLinea(heroes, indiceLineas, linea) {
  const conLineas = heroes.filter((h) => indiceLineas?.get?.(nombreClave(h.name))?.lanes?.length);
  if (!conLineas.length) return linea === 'roam' ? heroes.filter((h) => h.roam) : [];
  return heroes.filter((h) => indiceLineas.get(nombreClave(h.name))?.lanes?.includes(linea));
}

/**
 * ¿Es un aliado de los que hay que proteger? Un tanque también lleva
 * `immobile`: sin este filtro se recomendaba hacerle peel a la primera línea.
 * Lo usan la pareja por etiquetas y los baneos: un criterio, dos sitios.
 */
export const hayQueProtegerlo = (heroe) =>
  ['hypercarry', 'poke', 'burst'].some((t) => heroe?.tags?.includes(t)) && !heroe?.tags?.includes('tanky');

/** Proporción a partir de la cual un héroe pega de las dos cosas (del reparto real de los 133). */
const MIXTO_DESDE = 0.5;

/**
 * De qué pega un héroe: 'fisico', 'magico', 'mixto' o null. Contado en los
 * textos de habilidad de Moonton (ingesta), no deducido del rol: el rol se
 * equivoca con Gusion, Hylos, Natan y Kimmy. Es DATO: no se descuenta por
 * `PRECISION_DEDUCIDA`.
 */
export function tipoDeDano(heroe) {
  const d = heroe?.damage;
  if (!d) return null;
  const { fisico = 0, magico = 0 } = d;
  if (!fisico && !magico) return null;
  if (Math.min(fisico, magico) >= Math.max(fisico, magico) * MIXTO_DESDE) return 'mixto';
  return fisico > magico ? 'fisico' : 'magico';
}

/**
 * La huella del kit de un héroe: de qué pega y las etiquetas que le pone
 * Moonton. Es lo que cambia cuando le REHACEN las habilidades, y lo que NO
 * cambia con un reequilibrio de números.
 *
 * Medido entre el 7 y el 16 de septiembre de 2026: cuatro héroes cambiaron su
 * recuento de habilidades por tipo (Argus 4→5 de físico, Aulus 5→6, Bruno
 * 4→3, Balmond +1 de verdadero) y la huella no se movió en ninguno; tampoco
 * se movió con los cuatro que cambiaron de línea. Un aviso que salta con cada
 * retoque de números es un aviso que se deja de leer.
 *
 * Sirve para avisar de que los tags escritos a mano de un héroe se
 * escribieron para OTRO kit. NO se le deducen tags nuevos por eso: eso lo
 * mira una persona, que es la regla del proyecto desde el sesgo de Marcel.
 */
export function huellaDeKit(heroe) {
  const esp = [...(heroe?.speciality ?? [])].sort().join(',');
  // El tercer trozo es la huella del TEXTO de las habilidades (sin cifras),
  // que calcula la ingesta: con solo tipo y speciality no se vieron los
  // reworks de Masha y Bruno (2.2.16). Sin ella (datos de antes de 3.3.0) la
  // huella es la de dos trozos, y sigue casando con un catalogo antiguo.
  const texto = typeof heroe?.kitTexto === 'string' ? `|${heroe.kitTexto}` : '';
  return `${tipoDeDano(heroe) ?? '?'}|${esp}${texto}`;
}

/**
 * De qué pega un equipo y qué lado le falta. `falta` solo con dos héroes con
 * dato y ninguno del lado que falta: con uno no se puede decir nada.
 */
export function perfilDeDano(heroes = []) {
  const tipos = heroes.map(tipoDeDano);
  const conDato = tipos.filter(Boolean).length;
  const cuenta = (t) => tipos.filter((x) => x === t).length;
  const fisico = cuenta('fisico'); const magico = cuenta('magico'); const mixto = cuenta('mixto');
  let falta = null;
  if (conDato >= 2) {
    if (!magico && !mixto) falta = 'magico';
    else if (!fisico && !mixto) falta = 'fisico';
  }
  return { fisico, magico, mixto, sinDato: tipos.length - conDato, falta };
}

/**
 * Cuánto equilibrio de daño (min(físicos, mágicos)) cabe esperar de un
 * equipo de n héroes sacados al azar por pickrate: sirve para CENTRAR el
 * término de equilibrio con el draft a medias, como el centro de las
 * parejas. Sin centrar, el equipo con más héroes en pantalla saldría con
 * más equilibrio por el mero hecho de tener más héroes (el mismo sesgo que
 * ya costó una versión con las parejas). Con los dos equipos al completo la
 * corrección es la misma para los dos y se cancela.
 */
export function equilibrioEsperado(heroes = [], stats = null) {
  let pf = 0; let pm = 0; let po = 0;
  for (const h of heroes) {
    // Con estadísticas, cada héroe pesa su cuota de picks y uno sin dato no
    // pesa nada: un `?? 1` le daría a un héroe recién salido tanto peso como
    // a los 133 juntos (las cuotas suman 1). Sin estadísticas, todos igual.
    const w = stats ? (stats[nombreClave(h.name)]?.pickRate ?? 0) : 1;
    const t = tipoDeDano(h);
    if (t === 'fisico') pf += w; else if (t === 'magico') pm += w; else po += w;
  }
  const total = pf + pm + po || 1;
  pf /= total; pm /= total; po /= total;
  const fact = [1, 1, 2, 6, 24, 120];
  const esperado = [0];
  for (let n = 1; n <= 5; n++) {
    let e = 0;
    for (let f = 0; f <= n; f++) for (let m = 0; m <= n - f; m++) {
      const o = n - f - m;
      e += (fact[n] / (fact[f] * fact[m] * fact[o])) * pf ** f * pm ** m * po ** o * Math.min(f, m);
    }
    esperado.push(e);
  }
  return esperado;
}

/** Un héroe mixto tapa cualquier hueco; uno puro solo el suyo. */
export function tapaElHueco(heroe, falta) {
  if (!falta) return false;
  const t = tipoDeDano(heroe);
  return t === falta || t === 'mixto';
}

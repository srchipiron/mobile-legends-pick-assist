import { nombreClave } from './nombres.js';
import { tipoDeDano, PRECISION_DEDUCIDA } from './catalogo.js';

/**
 * Builds de objetos: lo que la gente compra de verdad, y cómo ajustarlo al
 * draft que tienes delante. Dos cosas MUY distintas viven aquí:
 *
 * 1. `buildsDe` devuelve DATO: las builds más jugadas de ese héroe en esa
 *    línea, con su winrate y su cuota de uso, tal como las publica la API.
 * 2. `ajustesDeBuild` devuelve un CONSEJO: sale de dos hechos medidos (de qué
 *    pega cada enemigo, cuánta defensa da cada objeto) más una regla evidente
 *    del juego. NO es una medición de builds contra este draft: ese dato no
 *    existe en ninguna parte, y la pantalla lo dice.
 */

/**
 * Builds de un héroe en una línea, de la más jugada a la menos. Se ORDENA POR
 * USO, no por winrate: el winrate de una build lleva dentro a QUIEN la compra
 * (las del 3% de uso salen por encima de las del 13%, y el héroe entero por
 * debajo de las tres).
 */
export function buildsDe(builds, heroe, linea) {
  if (!builds || !heroe || !linea) return [];
  const nombre = typeof heroe === 'string' ? heroe : heroe.name;
  const porLinea = builds[nombre] ?? indice(builds)[nombreClave(nombre)];
  const lista = porLinea?.[linea];
  if (!Array.isArray(lista)) return [];
  return fundirIguales(lista).sort((a, b) => (b.pickRate ?? 0) - (a.pickRate ?? 0));
}

/** Todo lo que la app ENSEÑA de una build: dos con la misma firma son indistinguibles en pantalla. */
const firma = (b) => [(b.objetos ?? []).join(','), b.emblema ?? '', b.hechizo ?? ''].join('|');

/**
 * Junta las builds que en pantalla se ven EXACTAMENTE igual: la API las
 * separa por un talento de emblema que no se descarga (57 de 492). Por
 * objetos MÁS emblema MÁS hechizo, no solo por objetos: 115 pares comparten
 * los tres objetos y cambian el hechizo, y ahí sí hay dos builds. El winrate
 * junto va PONDERADO POR USO: el uso es proporcional a la muestra.
 */
export function fundirIguales(lista) {
  const porFirma = new Map();
  for (const b of lista) {
    const clave = firma(b);
    const ya = porFirma.get(clave);
    if (!ya) { porFirma.set(clave, { ...b }); continue; }
    const pa = ya.pickRate ?? 0;
    const pb = b.pickRate ?? 0;
    if (ya.winRate != null && b.winRate != null && pa + pb > 0) ya.winRate = (ya.winRate * pa + b.winRate * pb) / (pa + pb);
    else if (ya.winRate == null) ya.winRate = b.winRate;
    ya.pickRate = pa + pb;
  }
  return [...porFirma.values()];
}

/** Índice por clave, una vez por objeto de builds («X.Borg» / «X Borg» se quedaban sin build). */
const cache = new WeakMap();
function indice(builds) {
  if (typeof builds !== 'object' || builds === null) return {};
  let idx = cache.get(builds);
  if (!idx) {
    idx = {};
    for (const [k, v] of Object.entries(builds)) idx[nombreClave(k)] = v;
    cache.set(builds, idx);
  }
  return idx;
}

/** Nombre legible de un objeto. Si no está en el catálogo, su id. */
export function nombreObjeto(equipment, id) {
  return equipment?.[id]?.nombre ?? equipment?.[String(id)]?.nombre ?? `#${id}`;
}

/** Objetos de una build, con nombre y defensa. */
export function objetosDe(equipment, build) {
  return (build?.objetos ?? []).map((id) => ({
    id,
    nombre: nombreObjeto(equipment, id),
    ...(equipment?.[id] ?? equipment?.[String(id)] ?? {}),
  }));
}

/**
 * De qué pega el equipo enemigo, en peso. Un héroe mixto cuenta medio a cada
 * lado y los sin dato no cuentan. `null` con menos de dos enemigos con dato.
 *
 * OJO con los nombres: el DAÑO va en masculino (`fisico`/`magico`) y la
 * DEFENSA de un objeto en femenino (`fisica`/`magica`). Leer un campo de
 * defensa en un perfil de daño da `undefined` sin que nada falle.
 */
export function amenazaEnemiga(enemigos = []) {
  let fisico = 0; let magico = 0; let conDato = 0;
  for (const e of enemigos) {
    const t = tipoDeDano(e);
    if (!t) continue;
    conDato += 1;
    if (t === 'fisico') fisico += 1;
    else if (t === 'magico') magico += 1;
    else { fisico += 0.5; magico += 0.5; }
  }
  if (conDato < 2) return null;
  const total = fisico + magico;
  return { fisico, magico, conDato, sinDato: enemigos.length - conDato, cuotaMagica: magico / total };
}

/**
 * Desde qué cuota de daño mágico enemigo se recomienda el lado mágico. No es
 * 0.5: cambiar de objeto cuesta oro y la build por defecto ya está elegida
 * por millones de partidas. Con cinco enemigos, cuatro de un lado.
 */
export const DESEQUILIBRIO = 0.7;

/** Objetos que solo puede comprar una línea, según la categoría de la API (`equiptypename`). */
const TIPO_DE_LINEA = { Jungle: 'jungle', Roam: 'roam' };

/**
 * Los objetos que ese jugador puede comprar en su línea: fuera los de OTRA
 * línea (a un roamer se le proponían las botas de JUNGLA), y los universales
 * delante de los de línea, que dicen lo mismo y no atan a una bendición.
 */
function usables(equipment, linea) {
  return Object.entries(equipment ?? {})
    .map(([id, o]) => ({ id: Number(id), ...o }))
    .filter((o) => { const suya = TIPO_DE_LINEA[o.tipo]; return !suya || suya === linea; })
    .sort((a, b) => (TIPO_DE_LINEA[a.tipo] ? 1 : 0) - (TIPO_DE_LINEA[b.tipo] ? 1 : 0));
}

/** Cuántos enemigos con dato hacen falta para hablar de una etiqueta: uno solo no define un draft. */
export const ENEMIGOS_PARA_HABLAR = 2;

/** Avisos como mucho: una app que siempre tiene tres consejos deja de leerse. */
export const TOPE_AVISOS = 2;

/** Los tags escritos a mano cuentan uno; los deducidos, `PRECISION_DEDUCIDA`. Lo que se ENSEÑA sigue siendo el número de cabezas. */
const cuentan = (heroes) => heroes.reduce((n, h) => n + (h?.inferred ? PRECISION_DEDUCIDA : 1), 0);

/**
 * Cómo se adapta la build al draft: el lado del que te van a pegar, la
 * curación enemiga y el control duro. Se callan los avisos que la build ya
 * cubre, y salen ordenados por cuánto pesan.
 *
 * @returns [{ clave, params, objetos, peso }]
 */
export function ajustesDeBuild(build, equipment, enemigos = [], linea = null) {
  const avisos = [];
  const objetos = objetosDe(equipment, build);
  const tiene = (efecto) => objetos.some((o) => o.efectos?.includes(efecto));

  const defensa = ajusteDefensivo(build, equipment, enemigos, linea);
  if (defensa) {
    avisos.push({
      clave: defensa.lado === 'magica' ? 'build.ajusteMagica' : 'build.ajusteFisica',
      params: { n: defensa.conDato, pct: Math.round((defensa.lado === 'magica' ? defensa.cuotaMagica : 1 - defensa.cuotaMagica) * 100) },
      objetos: defensa.alternativas,
      peso: 3,
    });
  }
  const curan = enemigos.filter((e) => e?.tags?.includes('heal') || e?.tags?.includes('sustain'));
  if (cuentan(curan) >= ENEMIGOS_PARA_HABLAR && !tiene('antiCuracion')) {
    avisos.push({
      clave: 'build.ajusteCuracion',
      params: { n: curan.length, quien: curan.slice(0, 2).map((e) => e.name).join(', ') },
      objetos: conEfecto(equipment, 'antiCuracion', linea),
      peso: 2,
    });
  }
  const controlan = enemigos.filter((e) => e?.tags?.includes('cc_hard'));
  if (cuentan(controlan) >= ENEMIGOS_PARA_HABLAR && !tiene('cortaControl')) {
    avisos.push({
      clave: 'build.ajusteControl',
      params: { n: controlan.length, quien: controlan.slice(0, 2).map((e) => e.name).join(', ') },
      objetos: conEfecto(equipment, 'cortaControl', linea),
      peso: 1,
    });
  }
  return avisos.filter((a) => a.objetos.length).sort((a, b) => b.peso - a.peso).slice(0, TOPE_AVISOS);
}

/** Objetos con un efecto, por defensa total y nombre (orden estable entre recargas). */
export function conEfecto(equipment, efecto, linea = null, cuantos = 3) {
  return usables(equipment, linea)
    .filter((o) => o.efectos?.includes(efecto))
    .sort((a, b) => (TIPO_DE_LINEA[a.tipo] ? 1 : 0) - (TIPO_DE_LINEA[b.tipo] ? 1 : 0)
      || ((b.magica ?? 0) + (b.fisica ?? 0)) - ((a.magica ?? 0) + (a.fisica ?? 0))
      || String(a.nombre).localeCompare(String(b.nombre)))
    .slice(0, cuantos);
}

/**
 * Qué lado conviene reforzar y si la build ya lo cubre. `null` cuando no hay
 * nada que decir. «Ya lleva defensa» es defensa COMPARABLE a la propuesta:
 * con `> 0`, los 15 de armadura de Immortality callaban el aviso contra tres
 * físicos (9 de 431 builds). Umbral: la mitad del mejor objeto propuesto.
 */
export function ajusteDefensivo(build, equipment, enemigos, linea = null) {
  const amenaza = amenazaEnemiga(enemigos);
  if (!amenaza) return null;
  const lado = amenaza.cuotaMagica >= DESEQUILIBRIO ? 'magica' : (1 - amenaza.cuotaMagica) >= DESEQUILIBRIO ? 'fisica' : null;
  if (!lado) return null;
  const objetos = objetosDe(equipment, build);
  const alternativas = mejoresDefensas(equipment, lado, linea);
  if (!alternativas.length) return null;
  const umbral = (alternativas[0][lado] ?? 0) / 2;
  if (objetos.some((o) => (o[lado] ?? 0) >= umbral)) return null;
  return { lado, cuotaMagica: amenaza.cuotaMagica, conDato: amenaza.conDato, alternativas };
}

/**
 * Los objetos que más defensa dan de un lado, por lo que dan (número del
 * juego). Fuera los que dan MENOS del lado que hace falta que del otro. No se
 * filtra por «objetos que la gente compra»: los tres primeros de cada lado ya
 * salen en builds reales, y los componentes baratos dan poca defensa.
 */
export function mejoresDefensas(equipment, lado, linea = null, cuantos = 3) {
  const otro = lado === 'magica' ? 'fisica' : 'magica';
  return usables(equipment, linea)
    .filter((o) => (o[lado] ?? 0) > 0 && (o[lado] ?? 0) >= (o[otro] ?? 0))
    .sort((a, b) => (TIPO_DE_LINEA[a.tipo] ? 1 : 0) - (TIPO_DE_LINEA[b.tipo] ? 1 : 0) || (b[lado] ?? 0) - (a[lado] ?? 0))
    .slice(0, cuantos);
}

/** Cuántos héroes de un pool tienen build en su línea (lo que importa para el diagnóstico). */
export function coberturaBuilds(pool, builds, linea) {
  const total = pool?.length ?? 0;
  const con = (pool ?? []).filter((h) => buildsDe(builds, h, linea).length).length;
  return { total, con };
}

import { cruce, sinergia, valido, CRUCE_FUERTE, CRUCE_FUERTE_EN_CONTRA, PAREJA_DESTACABLE } from './matrices.js';
import { terminoHeroe, logit } from './modelo.js';
import { perfilDeDano } from './catalogo.js';

/**
 * El plan de partida (3.36.0): qué hacer con el héroe que vas a coger EN
 * ESTE draft, y frases cortas para decir al equipo por voz. Pedido por
 * Javi: «consejos sobre cómo jugar ese personaje en esa partida en
 * concreto, como focus a tal… que sirva también como instrucciones para el
 * equipo».
 *
 * Es CONSEJO, no predicción, y conviene no mezclarlo con la nota: ninguna
 * frase de aquí está medida contra partidas (en pro, el kit no predice quién
 * gana: ver «Qué hace cada héroe» en CLAUDE.md). Lo que sí está medido son
 * los NOMBRES que salen en cada frase:
 *
 *  - «Focus a X»: el enemigo que más inclina la partida a su favor según el
 *    modelo, o sea su término de héroe más sus cruces contra los vuestros
 *    (lo mismo que suma `evaluarDraft`, visto desde su lado), sin contar a
 *    los que aguantan (`tanky`): ir a por el tanque es lo que NO hay que
 *    hacer.
 *  - Tu mejor y tu peor cruce, y tu mejor pareja: la matriz, con los cortes
 *    del p95/p05 (`CRUCE_FUERTE`): una orden por voz es una afirmación, y
 *    «evita a X» por un 48,4% no lo es.
 *  - Las habilidades (control en área, quitar controles, intocable): las
 *    etiquetas de Moonton de cada habilidad y su texto (la ingesta,
 *    `extraerHabilidades`). Sin ellas (datos de antes de 3.36.0) esas
 *    frases no salen.
 *  - Lo demás (escalado, proteger al tirador, daño, antisanación) lee las
 *    etiquetas de `heroes.json`, revisadas leyendo el kit entero (3.20.0).
 *
 * Los umbrales de «escaláis mejor» (dos héroes de diferencia) y «son todo
 * físico» (tres o más, ninguno mágico ni mixto) son decisiones de producto:
 * cuándo merece la pena decirlo, no una calibración.
 */

/** Cuántas frases como mucho: es para leerlas en mitad de una partida. */
export const MAX_EQUIPO = 5;
export const MAX_TUYO = 4;
/** Diferencia de héroes que escalan para decir «cerrad pronto» / «aguantad». Decisión de producto. */
export const DIFERENCIA_DE_ESCALADO = 2;

const tiene = (h, tag) => !!h?.tags?.includes(tag);
const habilidades = (h, efecto) => (h?.habilidades ?? []).filter((x) => x.e?.includes(efecto));
const escala = (h) => tiene(h, 'hypercarry') || tiene(h, 'assassin_late');
const pct = (v) => Math.round(v * 100);

/**
 * Lo que un enemigo inclina la partida a su favor, en log-odds: su término
 * de héroe y sus cruces contra los vuestros. Exportada para las pruebas.
 */
export function amenazaDe(enemigo, nos, meta = {}) {
  let v = terminoHeroe(enemigo, meta.stats, meta.mediaDelRango).valor;
  for (const n of nos) {
    const c = cruce(meta.counters, enemigo.name, n.name);
    if (valido(c)) v += logit(c);
  }
  return v;
}

/** El enemigo con más control: el que más habilidades de control tiene, y entre iguales, el que más amenaza. */
function masControl(enemigos, amenaza) {
  return [...enemigos]
    .map((e) => ({ e, n: habilidades(e, 'cc').length + (tiene(e, 'cc_chain') ? 1 : 0) + (tiene(e, 'engage') ? 1 : 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || amenaza.get(b.e.name) - amenaza.get(a.e.name))[0]?.e ?? null;
}

/**
 * @param {{ yo, aliados?, enemigos?, meta }} draft  `yo` es el héroe del que
 *        se habla (`eleccionDe`); `meta` el contexto de `prepararDatos`.
 * @returns {{ equipo: Array<{clave, params}>, tuyo: Array<{clave, params}> }}
 */
export function planDePartida({ yo = null, aliados = [], enemigos = [], meta = {} } = {}) {
  const equipo = []; const tuyo = [];
  if (!yo) return { equipo, tuyo };
  const companeros = aliados.filter((a) => a.name !== yo.name);
  const nos = [yo, ...companeros];
  const amenaza = new Map(enemigos.map((e) => [e.name, amenazaDe(e, nos, meta)]));
  // Entre varios compañeros que encajan, con quien mejor combinas.
  const conQuien = (lista) => [...lista].sort((a, b) => (sinergia(meta.synergies, yo.name, b.name) ?? 0.5) - (sinergia(meta.synergies, yo.name, a.name) ?? 0.5))[0];

  // ── Para el equipo ──────────────────────────────────────────────────────
  // 1. A quién matar primero.
  if (enemigos.length >= 2) {
    const blandos = enemigos.filter((e) => !tiene(e, 'tanky')).sort((a, b) => amenaza.get(b.name) - amenaza.get(a.name));
    if (blandos[0]) equipo.push({ clave: 'partida.focus', params: { e: blandos[0].name } });
  }
  // 2. Su control en área: separarse.
  const iniciador = [...enemigos]
    .filter((e) => tiene(e, 'engage') && habilidades(e, 'cc').some((x) => x.e.includes('area')))
    .sort((a, b) => amenaza.get(b.name) - amenaza.get(a.name))[0];
  if (iniciador) {
    const hab = habilidades(iniciador, 'cc').find((x) => x.e.includes('area'));
    equipo.push({ clave: 'partida.separaos', params: { e: iniciador.name, hab: hab.n } });
  }
  // 3. Quien se vuelve intocable: no gastarle el control encima.
  const intocable = enemigos.find((e) => habilidades(e, 'inmortal').length);
  if (intocable) equipo.push({ clave: 'partida.intocable', params: { e: intocable.name, hab: habilidades(intocable, 'inmortal')[0].n } });
  // 4. Proteger a vuestro tirador inmóvil de los que saltan.
  const carry = conQuien(companeros.filter((a) => escala(a) && tiene(a, 'immobile')));
  const saltador = [...enemigos].filter((e) => tiene(e, 'dive')).sort((a, b) => amenaza.get(b.name) - amenaza.get(a.name))[0];
  if (carry && saltador) equipo.push({ clave: 'partida.protegedA', params: { a: carry.name, e: saltador.name } });
  // 5. Quién escala mejor.
  if (enemigos.length >= 3 && nos.length >= 3) {
    const dif = nos.filter(escala).length - enemigos.filter(escala).length;
    if (dif >= DIFERENCIA_DE_ESCALADO) equipo.push({ clave: 'partida.aguantad', params: {} });
    else if (-dif >= DIFERENCIA_DE_ESCALADO) equipo.push({ clave: 'partida.cerradPronto', params: {} });
  }
  // 6. De qué pegan.
  if (enemigos.length >= 3) {
    const p = perfilDeDano(enemigos);
    if (p.fisico >= 3 && !p.magico && !p.mixto) equipo.push({ clave: 'partida.todoFisico', params: {} });
    else if (p.magico >= 3 && !p.fisico && !p.mixto) equipo.push({ clave: 'partida.todoMagico', params: {} });
  }
  // 7. Se curan.
  const curanderos = enemigos.filter((e) => tiene(e, 'heal'));
  if (curanderos.length >= 2) equipo.push({ clave: 'partida.antisanacion', params: { lista: curanderos.map((e) => e.name) } });

  // ── Para ti ─────────────────────────────────────────────────────────────
  // 1. Tu habilidad que quita controles, para el control que viene.
  const limpia = habilidades(yo, 'limpia')[0];
  const control = limpia ? masControl(enemigos, amenaza) : null;
  if (limpia && control) {
    tuyo.push({ clave: limpia.e.includes('aliados') ? 'partida.guardaLimpiezaAliados' : 'partida.guardaLimpieza', params: { hab: limpia.n, e: control.name } });
  }
  // 2. Si inicias tú, con quién; si proteges, a quién.
  const dano = companeros.filter((a) => tiene(a, 'burst') || escala(a));
  const usados = new Set();
  if (tiene(yo, 'engage') && dano.length) {
    const a = conQuien(dano); usados.add(a.name);
    tuyo.push({ clave: 'partida.abresTu', params: { a: a.name } });
  } else if ((tiene(yo, 'peel') || tiene(yo, 'sustain'))) {
    // A quién: el tirador inmóvil que el equipo tiene que proteger si lo
    // hay; si no, el que escala y no salta (a un asesino que entra solo no
    // se le acompaña: la primera versión decía «quédate con Fanny»).
    const a = carry ?? conQuien(companeros.filter((x) => escala(x) && !tiene(x, 'dive')));
    if (a) { usados.add(a.name); tuyo.push({ clave: 'partida.quedateCon', params: { a: a.name } }); }
  }
  // 3. Tu mejor pareja (si no la has nombrado ya).
  const pareja = companeros
    .map((a) => ({ a, s: sinergia(meta.synergies, yo.name, a.name) }))
    .filter((x) => valido(x.s) && x.s >= PAREJA_DESTACABLE && !usados.has(x.a.name))
    .sort((a, b) => b.s - a.s)[0];
  if (pareja) tuyo.push({ clave: 'partida.juegaCon', params: { a: pareja.a.name } });
  // 4. Tu peor y tu mejor cruce, solo si son claros.
  const cruces = enemigos.map((e) => ({ e, c: cruce(meta.counters, yo.name, e.name) })).filter((x) => valido(x.c));
  const peor = [...cruces].sort((a, b) => a.c - b.c)[0];
  if (peor && peor.c <= CRUCE_FUERTE_EN_CONTRA) tuyo.push({ clave: 'partida.evita', params: { e: peor.e.name, pct: pct(peor.c) } });
  const mejor = [...cruces].sort((a, b) => b.c - a.c)[0];
  if (mejor && mejor.c >= CRUCE_FUERTE) tuyo.push({ clave: 'partida.buscaA', params: { e: mejor.e.name, pct: pct(mejor.c) } });

  return { equipo: equipo.slice(0, MAX_EQUIPO), tuyo: tuyo.slice(0, MAX_TUYO) };
}

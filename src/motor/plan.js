import { cruce, sinergia, valido, CRUCE_FUERTE, CRUCE_FUERTE_EN_CONTRA, CRUCE_DESTACABLE, CRUCE_MALO, PAREJA_DESTACABLE } from './matrices.js';
import { terminoHeroe } from './modelo.js';
import { logit } from './estadistica.js';
import { perfilDeDano } from './catalogo.js';
import { PENDIENTE_DE_HEROE } from './fases.js';

/**
 * El plan de partida: qué hacer con tu héroe EN ESTE draft y frases cortas para el
 * equipo. Es CONSEJO, no nota (en pro el kit no predice quién gana); lo medido son
 * los NOMBRES: el focus es el enemigo blando que más inclina la partida según el
 * modelo, los cruces van con el p95/p05 (una orden por voz es una afirmación), las
 * habilidades salen de las etiquetas y el texto de Moonton, y las fases de la curva
 * por duración. Sin órdenes contrarias: manda el cruce con tu rival, luego el
 * equipo, y la frase de tu héroe solo si no choca.
 */

/** [P] Frases para el equipo y por etapa: se leen en mitad de una partida. */
export const MAX_EQUIPO = 5;
export const MAX_ETAPA = 3;
/** [P] Héroes que escalan de diferencia para «aguantad» / «cerrad pronto» (sin curvas, con los dos equipos enteros). */
export const DIFERENCIA_DE_ESCALADO = 2;

const tiene = (h, tag) => !!h?.tags?.includes(tag);
/** Apoyo o tanque: no farmea ni gana las peleas solo. */
export const esDeApoyo = (h) => h?.role === 'support' || h?.role === 'tank';
const habilidades = (h, efecto) => (h?.habilidades ?? []).filter((x) => x.e?.includes(efecto));
const escala = (h) => tiene(h, 'hypercarry') || tiene(h, 'assassin_late');
const pct = (v) => Math.round(v * 100);

/** Lo que un enemigo inclina la partida a su favor: su término de héroe + sus cruces contra los vuestros. */
export function amenazaDe(enemigo, nos, meta = {}) {
  let v = terminoHeroe(enemigo, meta.stats, meta.mediaDelRango).valor;
  for (const n of nos) {
    const c = cruce(meta.counters, enemigo.name, n.name);
    if (valido(c)) v += logit(c);
  }
  return v;
}

/** El de más control (habilidades de control + cc_chain + engage); a igualdad, el de más amenaza. */
function masControl(enemigos, amenaza) {
  return [...enemigos]
    .map((e) => ({ e, n: habilidades(e, 'cc').length + (tiene(e, 'cc_chain') ? 1 : 0) + (tiene(e, 'engage') ? 1 : 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || amenaza.get(b.e.name) - amenaza.get(a.e.name))[0]?.e ?? null;
}

/**
 * `yo`: el héroe del que se habla (`eleccionDe`); `meta`: el contexto de
 * `prepararDatos`; `fases`: lo de fases.js; `rival`: tu rival de línea.
 * @returns {{ equipo, tuyo, fases, fasesConfiables, etapas: { temprano, medio, tarde }, problemas }}
 */
export function planDePartida({ yo = null, aliados = [], enemigos = [], meta = {}, fases = null, rival = null } = {}) {
  const equipo = []; const temprano = []; const medio = []; const tarde = []; const problemas = [];
  if (!yo) return { equipo, tuyo: [], fases: null, etapas: { temprano, medio, tarde }, problemas };
  const companeros = aliados.filter((a) => a.name !== yo.name);
  const nos = [yo, ...companeros];
  const amenaza = new Map(enemigos.map((e) => [e.name, amenazaDe(e, nos, meta)]));
  const porAmenaza = (lista) => [...lista].sort((a, b) => amenaza.get(b.name) - amenaza.get(a.name));
  const conQuien = (lista) => [...lista].sort((a, b) => (sinergia(meta.synergies, yo.name, b.name) ?? 0.5) - (sinergia(meta.synergies, yo.name, a.name) ?? 0.5))[0];

  // ── Para el equipo ──
  if (enemigos.length >= 2) {
    const blando = porAmenaza(enemigos.filter((e) => !tiene(e, 'tanky')))[0];
    if (blando) equipo.push({ clave: 'partida.focus', params: { e: blando.name } });
  }
  const iniciador = porAmenaza(enemigos.filter((e) => tiene(e, 'engage') && habilidades(e, 'cc').some((x) => x.e.includes('area'))))[0];
  if (iniciador) equipo.push({ clave: 'partida.separaos', params: { e: iniciador.name, hab: habilidades(iniciador, 'cc').find((x) => x.e.includes('area')).n } });
  const intocable = enemigos.find((e) => habilidades(e, 'inmortal').length);
  if (intocable) equipo.push({ clave: 'partida.intocable', params: { e: intocable.name, hab: habilidades(intocable, 'inmortal')[0].n } });
  const carry = conQuien(companeros.filter((a) => escala(a) && tiene(a, 'immobile')));
  const saltador = porAmenaza(enemigos.filter((e) => tiene(e, 'dive')))[0];
  if (carry && saltador) equipo.push({ clave: 'partida.protegedA', params: { a: carry.name, e: saltador.name } });
  // Las fases se AFIRMAN con tres o más por bando; sin curvas, las etiquetas con los dos equipos enteros.
  const fasesConfiables = fases && enemigos.length >= 3 && nos.length >= 3 ? fases : null;
  if (fasesConfiables) {
    if (fases.tendencia === 'tarde') equipo.push({ clave: 'partida.aguantad', params: {} });
    else if (fases.tendencia === 'pronto') equipo.push({ clave: 'partida.cerradPronto', params: {} });
  } else if (!fases && enemigos.length >= 5 && nos.length >= 5) {
    const dif = nos.filter(escala).length - enemigos.filter(escala).length;
    if (dif >= DIFERENCIA_DE_ESCALADO) equipo.push({ clave: 'partida.aguantad', params: {} });
    else if (-dif >= DIFERENCIA_DE_ESCALADO) equipo.push({ clave: 'partida.cerradPronto', params: {} });
  }
  if (enemigos.length >= 4) {
    const p = perfilDeDano(enemigos);
    if (p.fisico >= 3 && !p.magico && !p.mixto) equipo.push({ clave: 'partida.todoFisico', params: {} });
    else if (p.magico >= 3 && !p.fisico && !p.mixto) equipo.push({ clave: 'partida.todoMagico', params: {} });
  }
  const curanderos = enemigos.filter((e) => tiene(e, 'heal'));
  if (curanderos.length >= 2) equipo.push({ clave: 'partida.antisanacion', params: { lista: curanderos.map((e) => e.name) } });

  // ── Al principio: tu héroe por su curva, tu línea, con quién ir y de quién cuidarse ──
  const tuFase = fases?.nos?.porHeroe?.find((x) => x.heroe.name === yo.name);
  const ext = (c) => ({ ini: pct(c.curva[0]), fin: pct(c.curva[c.curva.length - 1]) });
  const cRival = rival ? cruce(meta.counters, yo.name, rival.name) : null;
  const rivalGanas = rival && valido(cRival) && cRival >= CRUCE_DESTACABLE;
  const rivalPierdes = rival && valido(cRival) && cRival <= CRUCE_MALO;
  const equipoTarde = equipo.some((f) => f.clave === 'partida.aguantad');
  const equipoPronto = equipo.some((f) => f.clave === 'partida.cerradPronto');
  if (tuFase && tuFase.pendiente <= -PENDIENTE_DE_HEROE && !rivalPierdes && !equipoTarde) {
    temprano.push({ clave: esDeApoyo(yo) ? 'etapa.tuHeroeProntoApoyo' : 'etapa.tuHeroePronto', params: { yo: yo.name, ...ext(tuFase) } });
  } else if (tuFase && tuFase.pendiente >= PENDIENTE_DE_HEROE && !rivalGanas && !equipoPronto) {
    temprano.push({ clave: 'etapa.tuHeroeTarde', params: { yo: yo.name, ...ext(tuFase) } });
  }
  if (rivalGanas) temprano.push({ clave: 'etapa.rivalGanas', params: { e: rival.name, pct: pct(cRival) } });
  else if (rivalPierdes) temprano.push({ clave: 'etapa.rivalPierdes', params: { e: rival.name, pct: pct(cRival) } });
  const aliadoPronto = fases?.nos?.pronto;
  if (aliadoPronto && aliadoPronto.heroe.name !== yo.name && nos.length >= 2) temprano.push({ clave: 'etapa.aliadoPronto', params: { a: aliadoPronto.heroe.name } });
  // Ni de tu rival (ya dicho) ni de uno al que le ganas claro.
  const enemigoPronto = fases?.ellos?.pronto;
  const cPronto = enemigoPronto ? cruce(meta.counters, yo.name, enemigoPronto.heroe.name) : null;
  if (enemigoPronto && enemigos.length >= 2 && enemigoPronto.heroe.name !== rival?.name && !(valido(cPronto) && cPronto >= CRUCE_DESTACABLE)) {
    temprano.push({ clave: 'etapa.enemigoPronto', params: { e: enemigoPronto.heroe.name } });
  }

  // ── Al final: su carta (nunca un tanque ni un apoyo) y la vuestra (quien farmea) ──
  const enemigoTarde = [...(fases?.ellos?.porHeroe ?? [])]
    .filter((x) => !tiene(x.heroe, 'tanky') && !esDeApoyo(x.heroe) && x.pendiente >= PENDIENTE_DE_HEROE)
    .sort((a, b) => b.pendiente - a.pendiente)[0];
  if (enemigoTarde && enemigos.length >= 2) tarde.push({ clave: 'etapa.enemigoTarde', params: { e: enemigoTarde.heroe.name } });
  const aliadoTarde = fases?.nos?.tarde;
  if (aliadoTarde && aliadoTarde.heroe.name !== yo.name && !esDeApoyo(aliadoTarde.heroe) && nos.length >= 2) tarde.push({ clave: 'etapa.aliadoTarde', params: { a: aliadoTarde.heroe.name } });
  if (fasesConfiables?.cambio) tarde.push({ clave: fases.cambio.aFavor ? 'etapa.cambiaAFavor' : 'etapa.cambiaEnContra', params: { min: fases.cambio.minuto } });

  // ── En las peleas: tu limpieza, si abres o proteges, tu pareja, a quién buscar ──
  const limpia = habilidades(yo, 'limpia')[0];
  const control = limpia ? masControl(enemigos, amenaza) : null;
  if (limpia && control) medio.push({ clave: limpia.e.includes('aliados') ? 'partida.guardaLimpiezaAliados' : 'partida.guardaLimpieza', params: { hab: limpia.n, e: control.name } });
  const dano = companeros.filter((a) => tiene(a, 'burst') || escala(a));
  const usados = new Set();
  if (tiene(yo, 'engage') && dano.length) {
    const a = conQuien(dano); usados.add(a.name);
    medio.push({ clave: 'partida.abresTu', params: { a: a.name } });
  } else if (tiene(yo, 'peel') || tiene(yo, 'sustain')) {
    // Al tirador inmóvil; si no, al que escala y no salta (a quien entra solo no se le acompaña).
    const a = carry ?? conQuien(companeros.filter((x) => escala(x) && !tiene(x, 'dive')));
    if (a) { usados.add(a.name); medio.push({ clave: 'partida.quedateCon', params: { a: a.name } }); }
  }
  const pareja = companeros
    .map((a) => ({ a, s: sinergia(meta.synergies, yo.name, a.name) }))
    .filter((x) => valido(x.s) && x.s >= PAREJA_DESTACABLE && !usados.has(x.a.name))
    .sort((a, b) => b.s - a.s)[0];
  if (pareja) medio.push({ clave: 'partida.juegaCon', params: { a: pareja.a.name } });
  const cruces = enemigos.map((e) => ({ e, c: cruce(meta.counters, yo.name, e.name) })).filter((x) => valido(x.c) && x.e.name !== rival?.name);
  const peor = [...cruces].sort((a, b) => a.c - b.c)[0];
  const mejor = [...cruces].sort((a, b) => b.c - a.c)[0];
  if (mejor && mejor.c >= CRUCE_FUERTE) medio.push({ clave: 'partida.buscaA', params: { e: mejor.e.name, pct: pct(mejor.c) } });

  // ── Problemas: tu peor cruce y la fase en contra (lo del equipo no se repite) ──
  if (peor && peor.c <= CRUCE_FUERTE_EN_CONTRA) problemas.push({ clave: 'partida.evita', params: { e: peor.e.name, pct: pct(peor.c) } });
  if (fasesConfiables && fases.tendencia !== 'igual') {
    const corto = fases.puntos[0].p; const largo = fases.puntos[fases.puntos.length - 1].p;
    if (fases.tendencia === 'pronto' && largo < 0.5) problemas.push({ clave: 'problema.largaEnContra', params: { p: pct(largo) } });
    if (fases.tendencia === 'tarde' && corto < 0.5) problemas.push({ clave: 'problema.cortaEnContra', params: { p: pct(corto) } });
  }

  const etapas = { temprano: temprano.slice(0, MAX_ETAPA), medio: medio.slice(0, MAX_ETAPA), tarde: tarde.slice(0, MAX_ETAPA) };
  const cortados = problemas.slice(0, MAX_ETAPA);
  return {
    equipo: equipo.slice(0, MAX_EQUIPO),
    tuyo: [...etapas.temprano, ...etapas.medio, ...etapas.tarde, ...cortados],
    fases,
    fasesConfiables: !!fasesConfiables,
    etapas,
    problemas: cortados,
  };
}

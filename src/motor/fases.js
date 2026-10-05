import { buscar } from './nombres.js';
import { logit } from './modelo.js';

/**
 * Las fases de la partida (3.43.0): cómo cambia tu probabilidad de ganar
 * según el minuto en que ACABE la partida, y quién de cada equipo empuja
 * hacia las partidas cortas o hacia las largas.
 *
 * El dato es la curva por duración de la API (`curvaLinea` en
 * roam-meta.json): el winrate de cada héroe EN SU LÍNEA en las partidas que
 * acaban en cada tramo de dos minutos (10–12 … 20+). Medido el 5 de octubre
 * de 2026 (ver «Las fases de la partida» en CLAUDE.md):
 *
 *  - Es señal, no ruido: la pendiente de cada héroe-línea casa entre Gloria
 *    y Mítico a r = 0,88 (poblaciones distintas); σ entre héroes 1,4 pp por
 *    tramo, residuo a la recta 1,1 pp.
 *  - Predice: en 2.268 partidas pro con su duración, la forma de las curvas
 *    de los dos equipos EN EL TRAMO EN QUE ACABÓ la partida, sumada al
 *    modelo, mejora la verosimilitud fuera de muestra +4,9 por 1.000 con las
 *    curvas de Gloria (+6,2 con las de Mítico), coeficiente 0,71 ± 0,15
 *    (0,87 ± 0,16); con las curvas barajadas entre héroes, +0,45 y el signo
 *    al revés. El equipo «de late» gana el 42% de las partidas que acaban
 *    antes del 13 y el 50% de las que pasan del 18.
 *
 * Lo que NO dice: quién gana sin saber cuánto dura (eso es la nota de
 * siempre, `evaluarDraft`). Por eso se enseña como «si acaba en tal minuto»,
 * y el ranking no cambia.
 */

/** Minuto en que empieza cada tramo de la curva (el último es «20 o más»). El mismo orden que guarda la ingesta. */
export const TRAMOS = [10, 12, 14, 16, 18, 20];

/**
 * Cuánto pesa la forma de las curvas en el logit de la partida. Medido: 0,71
 * ± 0,15 con las curvas de Gloria y 2.268 partidas pro de 400 días (0,75 ±
 * 0,23 a 120 días; con las de Mítico, 0,87 y 0,90). La app usa las de
 * Gloria, las que trae la ingesta.
 */
export const COEF_FASE = 0.71;

/**
 * Diferencia de probabilidad entre la partida corta (10–12) y la larga
 * (20+) a partir de la cual se dice «sois de early / de late». Decisión de
 * producto con la frecuencia medida: en 300 drafts completos de roam la
 * diferencia va de −26 a +29 puntos (p05/p95) y p25/p75 en −10/+13, así que
 * con 10 puntos se dice en la mitad de los drafts. Por debajo, «igual».
 */
export const DIFERENCIA_DE_FASE = 0.10;

/**
 * Cuánto tiene que separarse la pendiente de UN héroe de la media (en
 * logit, de 10–12 a 20+) para nombrarlo como de early o de late. Decisión
 * de producto: en los 165 pares héroe-línea el p20 es −0,24 y el p80
 * +0,28, así que es el ~20% más extremo de cada lado (unos 6 puntos de
 * winrate entre la partida corta y la larga).
 */
export const PENDIENTE_DE_HEROE = 0.25;

const sigmoide = (x) => 1 / (1 + Math.exp(-x));
const valida = (c) => Array.isArray(c) && c.length === TRAMOS.length && c.every((v) => typeof v === 'number' && v > 0 && v < 1);

/** La forma de una curva: logit de cada tramo menos el de su total (o el de su media, sin total). */
export function formaDe(curva, total = null) {
  if (!valida(curva)) return null;
  const l = curva.map(logit);
  const centro = typeof total === 'number' && total > 0 && total < 1 ? logit(total) : l.reduce((a, b) => a + b, 0) / l.length;
  return l.map((v) => v - centro);
}

/** La curva de un héroe en una línea; si no juega esa, la de la línea que más juegue (la primera que tenga). */
export function curvaDe(curvaLinea, heroe, linea) {
  const porLinea = buscar(curvaLinea ?? {}, heroe?.name ?? heroe);
  if (!porLinea) return null;
  if (linea && valida(porLinea[linea])) return { linea, curva: porLinea[linea] };
  const otra = Object.entries(porLinea).find(([, c]) => valida(c));
  return otra ? { linea: otra[0], curva: otra[1] } : null;
}

/**
 * La forma media de lo que SALE, por tramo: la de todos los pares
 * héroe-línea ponderada por cuota de pick (repartida entre sus líneas). Es
 * lo que cabe esperar de un héroe que aún no se ha elegido: así un equipo
 * con menos héroes a la vista no parece de early o de late por eso.
 */
export function centroDeFases(curvaLinea = {}, winrateLinea = {}, stats = {}) {
  const suma = TRAMOS.map(() => 0);
  let peso = 0;
  for (const [nombre, porLinea] of Object.entries(curvaLinea ?? {})) {
    const lineas = Object.entries(porLinea ?? {}).filter(([, c]) => valida(c));
    const pr = buscar(stats ?? {}, nombre)?.pickRate;
    // Entre cuotas, el «no sé» vale 0 (CLAUDE.md, «Un peso por defecto de 1»).
    const w = (typeof pr === 'number' && pr > 0 ? pr : 0) / (lineas.length || 1);
    if (!w) continue;
    for (const [l, c] of lineas) {
      const f = formaDe(c, buscar(winrateLinea ?? {}, nombre)?.[l]);
      if (!f) continue;
      f.forEach((v, i) => { suma[i] += w * v; });
      peso += w;
    }
  }
  return peso ? suma.map((v) => v / peso) : TRAMOS.map(() => 0);
}

/**
 * La forma de un equipo: por tramo, la suma de las formas de sus héroes (cada
 * uno en su línea) menos el centro. Devuelve también la de cada héroe, para
 * nombrar a quien empuja hacia el early o hacia el late.
 *
 * @param {Array<{heroe, linea}>} equipo
 */
export function formaDeEquipo(equipo, { curvaLinea, winrateLinea, centro }) {
  const total = TRAMOS.map(() => 0);
  const porHeroe = [];
  for (const { heroe, linea } of equipo) {
    const c = curvaDe(curvaLinea, heroe, linea);
    if (!c) continue;
    const f = formaDe(c.curva, buscar(winrateLinea ?? {}, heroe.name)?.[c.linea]);
    if (!f) continue;
    const relativa = f.map((v, i) => v - (centro?.[i] ?? 0));
    relativa.forEach((v, i) => { total[i] += v; });
    // De 10–12 a 20+: positivo, crece con la partida; negativo, de early.
    porHeroe.push({ heroe, linea: c.linea, curva: c.curva, forma: relativa, pendiente: relativa[relativa.length - 1] - relativa[0] });
  }
  return { forma: total, porHeroe };
}

/**
 * Tu probabilidad de ganar si la partida acaba en cada tramo: la nota de
 * siempre (`pBase`, la de `evaluarDraft`) más la forma de los dos equipos en
 * ese tramo, con el coeficiente medido.
 */
export function probabilidadPorTramo(pBase, formaNos, formaEllos) {
  const base = logit(Math.min(0.999, Math.max(0.001, pBase)));
  return TRAMOS.map((desde, i) => ({
    desde,
    hasta: TRAMOS[i + 1] ?? null,
    p: sigmoide(base + COEF_FASE * ((formaNos[i] ?? 0) - (formaEllos[i] ?? 0))),
  }));
}

/**
 * Lo que se enseña: los seis puntos, si sois de early o de late (con la
 * diferencia medida), el minuto en que la partida cambia de lado si cambia,
 * y quién empuja hacia cada lado en cada equipo.
 */
export function fasesDePartida({ pBase, nos = [], ellos = [], datosFases }) {
  if (typeof pBase !== 'number' || !datosFases?.centro) return null;
  const A = formaDeEquipo(nos, datosFases);
  const E = formaDeEquipo(ellos, datosFases);
  if (!A.porHeroe.length) return null;
  const puntos = probabilidadPorTramo(pBase, A.forma, E.forma);
  const ini = puntos[0].p;
  const fin = puntos[puntos.length - 1].p;
  const tendencia = fin - ini >= DIFERENCIA_DE_FASE ? 'tarde' : ini - fin >= DIFERENCIA_DE_FASE ? 'pronto' : 'igual';
  // El primer tramo en que la partida cambia de lado (de ≥50% a <50% o al revés).
  // Solo con tendencia: con la partida igualada en todas las fases, cruzar
  // el 50% por medio punto no es «la partida cambia de lado».
  let cambio = null;
  for (let i = 1; tendencia !== 'igual' && i < puntos.length; i++) {
    if ((puntos[i - 1].p >= 0.5) !== (puntos[i].p >= 0.5)) { cambio = { minuto: puntos[i].desde, aFavor: puntos[i].p >= 0.5 }; break; }
  }
  const extremo = (lista, signo) => {
    const x = [...lista].sort((a, b) => signo * (b.pendiente - a.pendiente))[0];
    return x && signo * x.pendiente >= PENDIENTE_DE_HEROE ? x : null;
  };
  return {
    puntos, pBase, tendencia, cambio,
    nos: { tarde: extremo(A.porHeroe, 1), pronto: extremo(A.porHeroe, -1), porHeroe: A.porHeroe },
    ellos: { tarde: extremo(E.porHeroe, 1), pronto: extremo(E.porHeroe, -1), porHeroe: E.porHeroe },
  };
}

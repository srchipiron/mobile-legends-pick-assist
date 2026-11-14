import { buscar } from './nombres.js';
import { logit, sigmoide } from './estadistica.js';

/**
 * Las fases (no puntúa): cómo cambia tu probabilidad según el minuto en que ACABE la
 * partida, con la curva por duración de la API (`curvaLinea`: winrate de cada héroe
 * EN SU LÍNEA por tramo de dos minutos). [M] Es señal (pendientes Gloria–Mítico a
 * r = 0,88) y predice (2.268 pro: +4,9 de logL por 1.000 con su duración; barajadas,
 * +0,45 y el signo al revés). Se dice como «si acaba en tal minuto»: el ranking no cambia.
 */

/** [D/C] Minuto en que empieza cada tramo (el último, «20 o más»); el mismo orden que guarda la ingesta. */
export const TRAMOS = [10, 12, 14, 16, 18, 20];

/** [M] Peso de la forma de las curvas en el logit: 0,71 ± 0,15 (curvas de Gloria, 2.268 pro de 400 días). */
export const COEF_FASE = 0.71;

/** [P] Diferencia corta–larga desde la que se dice «sois de early / de late»: sale en la mitad de los drafts. */
export const DIFERENCIA_DE_FASE = 0.10;

/** [P] Pendiente de un héroe desde la que se le nombra de early o de late: p20/p80 de 165 pares. */
export const PENDIENTE_DE_HEROE = 0.25;

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
    // Entre cuotas, el «no sé» vale 0.
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
  // El ÚLTIMO cruce del 50 %, solo con tendencia y en su sentido.
  let cambio = null;
  for (let i = 1; tendencia !== 'igual' && i < puntos.length; i++) {
    if ((puntos[i - 1].p >= 0.5) !== (puntos[i].p >= 0.5)) cambio = { minuto: puntos[i].desde, aFavor: puntos[i].p >= 0.5 };
  }
  if (cambio && cambio.aFavor !== (tendencia === 'tarde')) cambio = null;
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

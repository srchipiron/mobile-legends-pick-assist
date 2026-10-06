import { TRAMOS } from './fases.js';

/**
 * Los consejos EN DIRECTO (3.44.0): el plan de partida (plan.js) y las fases
 * (fases.js) convertidos en un guion por minutos que el lector de Termux lee
 * en voz alta mientras se juega. Pedido por Javi: «que los consejos vayan en
 * tiempo real según los minutos que vaya la partida».
 *
 * No hay dato nuevo aquí: cada frase sale de lo que ya está medido (la nota
 * de `evaluarDraft`, la curva por duración de cada héroe con `COEF_FASE`, el
 * focus y los cruces de plan.js). Lo que se decide es CUÁNDO decirlo, y eso
 * sí es decisión de producto: lo de cada fase justo antes de que importe.
 *
 * El marcador (muertes de cada equipo) no entra todavía: el lector aún no
 * lo sabe leer. Recoge recortes del marcador a resolución completa para
 * aprender los dígitos (3.44.0), y cuando los lea, el guion podrá decir
 * «vais +4» con su efecto medido. Hasta entonces se habla del draft y del
 * minuto, que es lo que hay medido.
 *
 * Puro: devuelve claves y parámetros; traduce la app.
 */

/** Cuántas frases como mucho en cada aviso: es voz, mientras se juega. */
export const MAX_PARTES = 3;

/**
 * El minuto de cada aviso (contado desde que empieza la partida, que el
 * lector detecta por el minimapa). Decisión de producto: el inicio nada más
 * empezar; las peleas cuando acaban las líneas (5); las fases a los minutos
 * de sus tramos medidos (TRAMOS: 10–12 … 20+), un poco antes de que pesen.
 */
export const MINUTOS = { inicio: 0.25, peleas: 5, momento: 9, aguanta: 8, giro: 15, final: 13, veinte: 19.5 };

const pct = (p) => Math.round(p * 100);
/** La probabilidad del tramo que empieza en `desde` (10, 12 … 20). */
const pEn = (fases, desde) => fases?.puntos?.find((x) => x.desde === desde)?.p ?? null;

/**
 * El guion: `[{ min, partes: [{ clave, params }] }]`, ordenado por minuto,
 * sin avisos vacíos. `plan` es lo que devuelve `planear` (plan.js + fases).
 */
export function guionEnDirecto(plan) {
  if (!plan) return [];
  const { equipo = [], etapas = {}, problemas = [], fases = null } = plan;
  const avisos = [];
  const avisar = (min, partes) => { const p = partes.filter(Boolean).slice(0, MAX_PARTES); if (p.length) avisos.push({ min, partes: p }); };
  const focus = equipo.find((f) => f.clave === 'partida.focus');

  // Nada más empezar: con cuánto salís, y lo de los primeros minutos.
  avisar(MINUTOS.inicio, [
    fases ? { clave: 'directo.inicio', params: { p: pct(fases.pBase) } } : null,
    ...(etapas.temprano ?? []).slice(0, 1),
    focus,
  ]);

  // Cuando acaban las líneas y empiezan las peleas: lo de tu héroe en ellas.
  avisar(MINUTOS.peleas, [
    ...(etapas.medio ?? []).length ? [{ clave: 'directo.peleas', params: {} }, ...(etapas.medio ?? []).slice(0, 2)] : [],
  ]);

  if (fases) {
    const corto = pEn(fases, 10); const medio = pEn(fases, 14); const largo = pEn(fases, 20);
    if (fases.tendencia === 'pronto') {
      // Vuestro momento es ahora; y después, que cada minuto juega en contra.
      avisar(MINUTOS.momento, [{ clave: 'directo.vuestroMomento', params: { p: pct(Math.max(corto, pEn(fases, 12) ?? corto)) } }]);
      avisar(MINUTOS.giro, [{ clave: 'directo.cadaMinutoContra', params: { p: pct(largo) } }]);
    } else if (fases.tendencia === 'tarde') {
      avisar(MINUTOS.aguanta, [{ clave: 'directo.aguantad', params: { p: pct(corto), fin: pct(largo) } }]);
      avisar(MINUTOS.giro, [{ clave: 'directo.ahoraVosotros', params: { p: pct(largo) } }]);
    }
    // El cambio de lado (solo el que dice fases.js: con tendencia y en su
    // sentido), dos minutos antes. Si cae en otro aviso, va con él.
    if (fases.cambio && plan.etapas?.tarde?.some((f) => f.clave?.startsWith('etapa.cambia'))) {
      avisar(Math.max(MINUTOS.peleas + 1, fases.cambio.minuto - 2), [{ clave: fases.cambio.aFavor ? 'directo.cambiaAFavor' : 'directo.cambiaEnContra', params: { min: fases.cambio.minuto } }]);
    }
    // Lo de la partida larga: su carta y la vuestra.
    const tardias = (etapas.tarde ?? []).filter((f) => f.clave === 'etapa.enemigoTarde' || f.clave === 'etapa.aliadoTarde');
    if (tardias.length) avisar(MINUTOS.final, tardias.slice(0, 2));
    // Pasado el 20: cuánto os queda.
    if (largo != null && medio != null) avisar(MINUTOS.veinte, [{ clave: largo >= 0.5 ? 'directo.veinteAFavor' : 'directo.veinteEnContra', params: { p: pct(largo) } }]);
  }
  // Tu peor cruce, si lo hay, con las peleas (es un problema de todas ellas).
  const evita = problemas.find((f) => f.clave === 'partida.evita');
  if (evita) {
    const peleas = avisos.find((a) => a.min === MINUTOS.peleas);
    if (peleas && peleas.partes.length < MAX_PARTES) peleas.partes.push(evita);
    else if (!peleas) avisar(MINUTOS.peleas, [evita]);
  }
  return avisos.sort((a, b) => a.min - b.min);
}

/**
 * Lo que puede durar una partida, en minutos: los mismos límites que
 * `tramoDe` de medir-fases.mjs (de 3 a 90, sin los extremos). Fuera de eso
 * es una medida rota, no una partida: ni tramo ni duración apuntada.
 */
export const DURACION_MINIMA = 3;
export const DURACION_MAXIMA = 90;
export const esDuracionPosible = (min) => typeof min === 'number' && min > DURACION_MINIMA && min < DURACION_MAXIMA;

/**
 * El tramo de una duración en minutos (10–12 → 0 … 20+ → 4 y 5): el mismo
 * reparto que medir-fases.mjs, para que lo que se mide en tus partidas sea
 * lo mismo que se midió en las pro.
 */
export function tramoDeMinutos(min) {
  if (!esDuracionPosible(min)) return null;
  return Math.max(0, Math.min(TRAMOS.length - 1, Math.floor((min - TRAMOS[0]) / 2)));
}

/**
 * Lo que se dice al acabar, una frase por tramo: «acabó entre el 14 y el
 * 16, y en ese tramo os daba un 57%». La elige el lector con la duración
 * que mide; la app no sabe cuándo acabó (está en el bolsillo).
 */
export function cierresPorTramo(fases) {
  if (!fases?.puntos?.length) return [];
  return fases.puntos.map((x) => ({ clave: x.hasta ? 'directo.cierre' : 'directo.cierreLargo', params: { desde: x.desde, hasta: x.hasta, p: pct(x.p) } }));
}

import { nombreClave, buscar } from './nombres.js';
import { cruce, CRUCE_MALO } from './matrices.js';
import { perfilDeDano, tapaElHueco } from './catalogo.js';
import { esPickCiego } from './ranking.js';
import { CUOTA_ROBUSTA } from './robustez.js';
import { HUECOS_QUE_SE_DICEN } from './composicion.js';
import { TEAM_NEEDS, SATISFIES } from './reglas.js';

/**
 * Hasta tres frases sobre el draft que tienes delante: lo que NO se ve en
 * las tarjetas. Si ganas o pierdes tu cruce de línea, quién te va a hacer
 * daño, si eliges a ciegas, si al equipo le falta algo que tú no aportas y
 * cuánto le saca el nº1 al nº2. Cuando no hay dato, se calla: una frase
 * inventada en 30 segundos de draft es peor que ninguna.
 *
 * @typedef {{ tono: 'bien'|'ojo'|'duda', clave: string, params?: object }} Frase
 */

/**
 * Desde cuánto un cruce deja de ser ruido y merece decirse: la misma cola
 * (p90/p10) con la que el motor dice «ganas el cruce». Estuvo en 0.03 (el
 * percentil 1,6%), y con eso un draft completo producía UNA frase. No tiene
 * umbral propio: sale de `CRUCE_MALO`, y hay una prueba de que sigue así.
 */
const CRUCE_CLARO = 0.5 - CRUCE_MALO;

/**
 * Desde cuántos puntos de probabilidad el nº1 «le saca» al nº2 y se dice
 * «pick claro». Decisión de frecuencia, como el margen de empate: 2 puntos
 * es el p85 de la distancia nº1–nº2 en 300 drafts de roam con el modelo de
 * 2.0 (1,94), así que se dice en uno de cada siete drafts.
 */
export const BRECHA_CLARA = 2;

/**
 * ¿La simulación se hizo con ESTE draft? En la app va diferida y el ranking
 * no: durante un render la cuota es la del draft anterior y el nº1 el de
 * este, y un héroe que la simulación no vio salía «frágil 0%». Una
 * simulación sin marca se acepta.
 */
function esDeEsteDraft(robustez, enemigos, aliados, baneos) {
  const mismo = (marca, equipo) => {
    if (!Array.isArray(marca)) return true;
    const ahora = equipo.map((h) => nombreClave(h.name)).sort();
    return marca.length === ahora.length && marca.every((n, i) => n === ahora[i]);
  };
  // Los baneos también cambian los finales (un baneado no sale por ninguna
  // línea): una simulación hecha con otros baneos no es de este draft.
  return mismo(robustez.enemigos, enemigos) && mismo(robustez.aliados, aliados) && mismo(robustez.baneos, baneos);
}

/**
 * @param {object} d
 * @param d.eleccion      el candidato del que se habla (por defecto, el nº1): tu pick fijado, si lo hay
 * @param d.baneos        los baneados, para saber si la simulación es de este draft
 * @param d.ranking       lo que devuelve ordenarPicks
 * @param d.rivalDeLinea  nombre del rival de tu línea, o null
 * @param d.empate        lo que devuelve empatados
 * @param d.robustez      lo que devuelve simularFinales, o null
 * @param d.composicion   lo que devuelve analizarComposicion, o null
 * @returns {Frase[]} como mucho tres
 */
export function analizarDraft({
  eleccion, ranking = [], enemigos = [], aliados = [], baneos = [], meta = {},
  rivalDeLinea = null, empate = [], robustez = null, composicion = null,
} = {}) {
  const salida = [];
  const top = eleccion ?? ranking[0];
  // ¿Se habla del nº1 o de un pick fijado que no lo es? La simulación cuenta
  // votos de nº1, así que «sigue siendo el nº1 en el 0%» de un pick fijado
  // que iba segundo no dice nada: esa frase es para decidir, no para el que
  // ya decidió.
  const esElNumeroUno = !ranking[0] || !top || top.heroe === ranking[0].heroe || top.heroe?.name === ranking[0].heroe?.name;

  // 0. ¿Aguanta el nº1 lo que falta por salir? Solo a medias y con simulación
  //    hecha para este draft. Va primera: es la única frase que habla del
  //    futuro del draft y no de lo que ya se ve.
  if (top && esElNumeroUno && robustez?.lineasAbiertas?.length && robustez.cuota && esDeEsteDraft(robustez, enemigos, aliados, baneos)) {
    const cuota = robustez.cuota[top.heroe.name] ?? 0;
    const pct = Math.round(cuota * 100);
    const params = { yo: top.heroe.name, pct, faltan: robustez.lineasAbiertas.length };
    salida.push(cuota >= CUOTA_ROBUSTA
      ? { tono: 'bien', clave: 'analisis.pickRobusto', params }
      : { tono: 'duda', clave: 'analisis.pickFragil', params });
  }
  if (!top) return salida;
  const heroe = top.heroe ?? top;

  // 1. Tu línea. Primero el cruce de la pareja, que es el dato bueno; si está
  //    igualado (o el rival es nuevo, sin dato) se comparan los winrates
  //    sueltos, que es peor información y por eso se dice con otras palabras.
  if (rivalDeLinea) {
    const par = cruce(meta.counters, heroe.name, rivalDeLinea);
    if (par != null && Math.abs(par - 0.5) >= CRUCE_CLARO) {
      const pct = Math.round(par * 100);
      salida.push(par > 0.5
        ? { tono: 'bien', clave: 'analisis.ganasCruce', params: { yo: heroe.name, pct, rival: rivalDeLinea } }
        : { tono: 'ojo', clave: 'analisis.pierdesCruce', params: { pct, rival: rivalDeLinea } });
    } else {
      const mio = buscar(meta.stats, heroe.name)?.winRate;
      const suyo = buscar(meta.stats, rivalDeLinea)?.winRate;
      // 2 puntos: lo supera el 63% de los pares y la σ entre héroes es ≈3
      // puntos, así que es una diferencia real y no ruido.
      if (mio != null && suyo != null && Math.abs(mio - suyo) >= 0.02) {
        const dif = Math.round(Math.abs(mio - suyo) * 100);
        salida.push(mio > suyo
          ? { tono: 'bien', clave: 'analisis.tuWinrateMejor', params: { dif, rival: rivalDeLinea } }
          : { tono: 'ojo', clave: 'analisis.suWinrateMejor', params: { dif, rival: rivalDeLinea } });
      }
    }
  }

  // 2. Quién te va a hacer daño: el peor cruce entre los YA elegidos.
  if (enemigos.length) {
    const peor = enemigos
      .map((e) => ({ e, v: cruce(meta.counters, heroe.name, e.name) }))
      .filter((x) => x.v != null && x.v < 0.5 - CRUCE_CLARO)
      .sort((a, b) => a.v - b.v)[0];
    if (peor && peor.e.name !== rivalDeLinea) {
      salida.push({ tono: 'ojo', clave: 'analisis.cuidadoCon', params: { e: peor.e.name, pct: Math.round(peor.v * 100) } });
    }
  }

  // 3. ¿Estás eligiendo a ciegas? El riesgo ya lo calcula el motor.
  if (esPickCiego(top.riesgo, enemigos.length)) {
    salida.push({ tono: 'duda', clave: 'analisis.pickCiego', params: { n: 5 - enemigos.length, yo: heroe.name } });
  }

  // 4. De qué pega vuestro equipo. Tres aliados, no dos: «tu equipo pega todo
  //    físico» es una AFIRMACIÓN y dos héroes de cinco no la sostienen
  //    (medido: con dos salía en el 35% de los drafts, con tres en el 11,6%).
  //    Dos frases distintas: si el pick TAPA el hueco es una razón para
  //    cogerlo, y si no lo tapa es un aviso.
  if (aliados.length >= 3) {
    const { falta } = perfilDeDano(aliados);
    if (falta) {
      const tapa = tapaElHueco(heroe, falta);
      salida.push(tapa
        ? { tono: 'bien', clave: falta === 'magico' ? 'analisis.todoFisico' : 'analisis.todoMagico', params: { yo: heroe.name } }
        : { tono: 'ojo', clave: falta === 'magico' ? 'analisis.faltaMagico' : 'analisis.faltaFisico', params: { yo: heroe.name } });
    }
  }

  // 5. Lo que le falta al equipo aparte del daño (primera línea, control,
  //    inicio), y el rol doble, que sí está medido en las parejas.
  if (composicion && aliados.length >= 3) {
    const dichos = (tags) => tags.filter((tg) => HUECOS_QUE_SE_DICEN.includes(tg)).map((tg) => `comp.${tg}`);
    const tapa = dichos(composicion.tapa);
    const faltan = dichos(composicion.mio.huecos);
    if (tapa.length) salida.push({ tono: 'bien', clave: 'analisis.yoTapo', params: { yo: heroe.name, lista: tapa } });
    else if (faltan.length) salida.push({ tono: 'ojo', clave: 'analisis.equipoLeFalta', params: { yo: heroe.name, lista: faltan } });
    const doble = composicion.mio.dobles.find((d) => d.rol === heroe.role);
    if (doble) {
      salida.push({ tono: 'ojo', clave: 'analisis.rolDoble', params: { yo: heroe.name, n: doble.n, rol: [`rolPlural.${doble.rol}`], pp: Math.abs(doble.pp).toFixed(1) } });
    }
  }
  if (composicion && enemigos.length >= 4) {
    const sin = composicion.suyo.huecos.filter((tg) => ['tanky', 'cc_hard'].includes(tg)).map((tg) => `comp.${tg}`);
    if (sin.length) salida.push({ tono: 'bien', clave: 'analisis.ellosSin', params: { lista: sin } });
  }

  // 6. Cuánto le saca al siguiente. Esto SIEMPRE se puede decir, y es lo que
  //    decide si merece la pena pensárselo o coger y tirar.
  const segundo = ranking.find((r) => r.heroe.name !== heroe.name);
  if (segundo && top.p != null && segundo.p != null) {
    const brecha = Math.round((top.p - segundo.p) * 100);
    // Con un pick fijado que NO es el nº1, «el siguiente» es el nº1: se dice
    // cuánto le falta, con el mismo umbral, para que se sepa lo que cuesta.
    if (!esElNumeroUno && -brecha >= BRECHA_CLARA) {
      salida.push({ tono: 'duda', clave: 'analisis.tuPickPorDebajo', params: { yo: heroe.name, puntos: -brecha, mejor: segundo.heroe.name } });
    } else if (brecha >= BRECHA_CLARA) {
      salida.push({ tono: 'bien', clave: 'analisis.pickClaro', params: { yo: heroe.name, puntos: brecha } });
    } else if (empate.length > 1 && empate.some((x) => x.heroe.name === heroe.name)) {
      const otros = empate.map((x) => x.heroe.name).filter((n) => n !== heroe.name);
      if (otros.length) salida.push({ tono: 'duda', clave: 'analisis.empatadoCon', params: { otros: otros.slice(0, 2).join(' / ') } });
    }
  }

  // 7. Un hueco caro que tú NO tapas, solo SIN composición (con ella, el
  //    bloque 5 ya lo dice sobre los mismos huecos y salían las dos juntas en
  //    el 15% de los drafts). Filtro apretado: sin él salía en el 98%.
  if (aliados.length >= 3 && !composicion) {
    const cubierto = new Set([...aliados, heroe].flatMap((h) => h.tags ?? []));
    const caros = [...TEAM_NEEDS].sort((a, b) => b.weight - a.weight).slice(0, 3);
    const falta = caros.find((n) => !(SATISFIES[n.tag] ?? [n.tag]).some((tg) => cubierto.has(tg)));
    if (falta) salida.push({ tono: 'duda', clave: 'analisis.huecoSinTapar', params: { yo: heroe.name, lista: [`comp.${falta.tag}`] } });
  }

  return salida.slice(0, 3);
}

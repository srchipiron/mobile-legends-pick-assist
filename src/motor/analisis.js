import { nombreClave, buscar } from './nombres.js';
import { cruce, CRUCE_MALO, CRUCE_FUERTE_EN_CONTRA } from './matrices.js';
import { perfilDeDano, tapaElHueco } from './catalogo.js';
import { esPickCiego } from './ranking.js';
import { CUOTA_ROBUSTA } from './robustez.js';
import { HUECOS_QUE_SE_DICEN } from './composicion.js';

/**
 * Hasta tres frases sobre el draft: lo que NO se ve en las tarjetas. Sin dato se
 * calla: una frase inventada en 30 segundos de draft es peor que ninguna.
 * @typedef {{ tono: 'bien'|'ojo'|'duda', clave: string, params?: object }} Frase
 */

/** [M] Un cruce se dice desde la misma cola con la que el motor dice «ganas el cruce» (p90/p10); sin «por poco», desde el p95/p05. */
const CRUCE_CLARO = 0.5 - CRUCE_MALO;
const CRUCE_FIRME = 0.5 - CRUCE_FUERTE_EN_CONTRA;
/** [M] Dos puntos de winrate entre tú y tu rival: lo supera el 63 % de los pares, con σ ≈ 3 entre héroes. */
const WINRATE_DISTINTO = 0.02;
/** [M] «Tu equipo pega todo físico» con tres aliados, no dos (con dos salía en el 35 % de los drafts; con tres, 11,6 %). */
const ALIADOS_PARA_AFIRMAR = 3;
/** [M/P] Puntos que el nº1 le saca al nº2 para decir «pick claro»: p85 en 300 drafts de roam (1,94). */
export const BRECHA_CLARA = 2;
const FRASES = 3;

/** ¿La simulación es de ESTE draft? (va diferida; sin marca se acepta). Los baneos también cambian los finales. */
function esDeEsteDraft(robustez, enemigos, aliados, baneos) {
  const mismo = (marca, equipo) => {
    if (!Array.isArray(marca)) return true;
    const ahora = equipo.map((h) => nombreClave(h.name)).sort();
    return marca.length === ahora.length && marca.every((n, i) => n === ahora[i]);
  };
  return mismo(robustez.enemigos, enemigos) && mismo(robustez.aliados, aliados) && mismo(robustez.baneos, baneos);
}

/**
 * `eleccion`: de quién se habla (tu pick fijado o el nº1); `ranking`, `empate`,
 * `robustez` y `composicion`: lo que dan ordenarPicks, empatados, simularFinales
 * y analizarComposicion.
 * @returns {Frase[]} como mucho tres
 */
export function analizarDraft({
  eleccion, ranking = [], enemigos = [], aliados = [], baneos = [], meta = {},
  rivalDeLinea = null, empate = [], robustez = null, composicion = null,
} = {}) {
  const salida = [];
  const top = eleccion ?? ranking[0];
  // La simulación cuenta votos de nº1: de un pick fijado que no lo es no dice nada.
  const esElNumeroUno = !ranking[0] || !top || top.heroe === ranking[0].heroe || top.heroe?.name === ranking[0].heroe?.name;

  // 0. ¿Aguanta lo que falta por salir? La única frase sobre el futuro del draft.
  if (top && esElNumeroUno && robustez?.lineasAbiertas?.length && robustez.cuota && esDeEsteDraft(robustez, enemigos, aliados, baneos)) {
    const cuota = robustez.cuota[top.heroe.name] ?? 0;
    const params = { yo: top.heroe.name, pct: Math.round(cuota * 100), faltan: robustez.lineasAbiertas.length };
    salida.push(cuota >= CUOTA_ROBUSTA ? { tono: 'bien', clave: 'analisis.pickRobusto', params } : { tono: 'duda', clave: 'analisis.pickFragil', params });
  }
  if (!top) return salida;
  const heroe = top.heroe ?? top;

  // 1. Tu línea: el cruce con tu rival y, si está igualado o sin dato, los winrates sueltos.
  if (rivalDeLinea) {
    const par = cruce(meta.counters, heroe.name, rivalDeLinea);
    if (par != null && Math.abs(par - 0.5) >= CRUCE_CLARO) {
      const pct = Math.round(par * 100);
      const poco = Math.abs(par - 0.5) < CRUCE_FIRME ? 'Poco' : '';
      salida.push(par > 0.5
        ? { tono: 'bien', clave: `analisis.ganasCruce${poco}`, params: { yo: heroe.name, pct, rival: rivalDeLinea } }
        : { tono: 'ojo', clave: `analisis.pierdesCruce${poco}`, params: { pct, rival: rivalDeLinea } });
    } else {
      const mio = buscar(meta.stats, heroe.name)?.winRate;
      const suyo = buscar(meta.stats, rivalDeLinea)?.winRate;
      if (mio != null && suyo != null && Math.abs(mio - suyo) >= WINRATE_DISTINTO) {
        const dif = Math.round(Math.abs(mio - suyo) * 100);
        salida.push(mio > suyo
          ? { tono: 'bien', clave: 'analisis.tuWinrateMejor', params: { dif, rival: rivalDeLinea } }
          : { tono: 'ojo', clave: 'analisis.suWinrateMejor', params: { dif, rival: rivalDeLinea } });
      }
    }
  }

  // 2. Quién te va a hacer daño entre los ya elegidos (que no sea tu rival, ya dicho).
  if (enemigos.length) {
    const peor = enemigos
      .map((e) => ({ e, v: cruce(meta.counters, heroe.name, e.name) }))
      .filter((x) => x.v != null && x.v < 0.5 - CRUCE_CLARO)
      .sort((a, b) => a.v - b.v)[0];
    if (peor && peor.e.name !== rivalDeLinea) {
      const poco = peor.v > 0.5 - CRUCE_FIRME ? 'Poco' : '';
      salida.push({ tono: 'ojo', clave: `analisis.cuidadoCon${poco}`, params: { e: peor.e.name, pct: Math.round(peor.v * 100) } });
    }
  }

  // 3. ¿Eliges a ciegas?
  if (esPickCiego(top.riesgo, enemigos.length)) salida.push({ tono: 'duda', clave: 'analisis.pickCiego', params: { n: 5 - enemigos.length, yo: heroe.name } });

  // 4. De qué pega vuestro equipo: si tú tapas el hueco es una razón; si no, un aviso.
  if (aliados.length >= ALIADOS_PARA_AFIRMAR) {
    const { falta } = perfilDeDano(aliados);
    if (falta) {
      salida.push(tapaElHueco(heroe, falta)
        ? { tono: 'bien', clave: falta === 'magico' ? 'analisis.todoFisico' : 'analisis.todoMagico', params: { yo: heroe.name } }
        : { tono: 'ojo', clave: falta === 'magico' ? 'analisis.faltaMagico' : 'analisis.faltaFisico', params: { yo: heroe.name } });
    }
  }

  // 5. Lo que le falta aparte del daño, el rol doble (medido) y lo que les falta a ellos.
  if (composicion && aliados.length >= ALIADOS_PARA_AFIRMAR) {
    const dichos = (tags) => tags.filter((tg) => HUECOS_QUE_SE_DICEN.includes(tg)).map((tg) => `comp.${tg}`);
    const tapa = dichos(composicion.tapa);
    const faltan = dichos(composicion.mio.huecos);
    if (tapa.length) salida.push({ tono: 'bien', clave: 'analisis.yoTapo', params: { yo: heroe.name, lista: tapa } });
    else if (faltan.length) salida.push({ tono: 'ojo', clave: 'analisis.equipoLeFalta', params: { yo: heroe.name, lista: faltan } });
    const doble = composicion.mio.dobles.find((d) => d.rol === heroe.role);
    if (doble) salida.push({ tono: 'ojo', clave: 'analisis.rolDoble', params: { yo: heroe.name, n: doble.n, rol: [`rolPlural.${doble.rol}`], pp: Math.abs(doble.pp).toFixed(1) } });
  }
  if (composicion && enemigos.length >= 4) {
    const sin = composicion.suyo.huecos.filter((tg) => ['tanky', 'cc_hard'].includes(tg)).map((tg) => `comp.${tg}`);
    if (sin.length) salida.push({ tono: 'bien', clave: 'analisis.ellosSin', params: { lista: sin } });
  }

  // 6. Cuánto le saca al siguiente, comparado SIN redondear (se redondea al decirlo).
  const segundo = ranking.find((r) => r.heroe.name !== heroe.name);
  if (segundo && top.p != null && segundo.p != null) {
    const brecha = (top.p - segundo.p) * 100;
    if (!esElNumeroUno && -brecha >= BRECHA_CLARA) {
      salida.push({ tono: 'duda', clave: 'analisis.tuPickPorDebajo', params: { yo: heroe.name, puntos: Math.round(-brecha), mejor: segundo.heroe.name } });
    } else if (brecha >= BRECHA_CLARA) {
      salida.push({ tono: 'bien', clave: 'analisis.pickClaro', params: { yo: heroe.name, puntos: Math.round(brecha) } });
    } else if (empate.length > 1 && empate.some((x) => x.heroe.name === heroe.name)) {
      const otros = empate.map((x) => x.heroe.name).filter((n) => n !== heroe.name);
      if (otros.length) salida.push({ tono: 'duda', clave: 'analisis.empatadoCon', params: { otros: otros.slice(0, 2).join(' / ') } });
    }
  }
  return salida.slice(0, FRASES);
}

import { nombreClave } from '../nombres.js';
import { TOPE_DE_SIEMPRE } from '../maestria.js';
import { resumen, calibracion, aciertosDelLector, MINIMO_PARA_CONCLUIR } from '../registro.js';

/**
 * Lo tuyo: la maestría y las partidas apuntadas. En la vigilancia automática
 * no hay móvil, así que con `entorno.sinDatosPersonales` no son avisos: si lo
 * fueran, todos los informes automáticos vendrían con avisos y dejaríamos de
 * leerlos.
 *
 * @param {import('./informe.js').Informe} inf
 */
export function seccionMaestria(inf, { datos, maestria = {}, entorno = {} }) {
  inf.seccion('MAESTRÍA');
  const conMaestria = Object.keys(maestria ?? {}).length;
  if (entorno.sinDatosPersonales) inf.linea('Sin acceso: la maestría vive en el móvil');
  else inf.check(conMaestria >= 5, `${conMaestria} héroes con datos tuyos`, `Solo ${conMaestria} héroes con datos tuyos: rellena más para el Veredicto y la tablet`, true);
  if (!conMaestria) return;
  inf.linea('Tus resultados no entran en la nota (3.93.0): la maestría la usan el Veredicto, la tablet y la comunidad');
  const sumadas = Object.values(maestria).reduce((n, m) => n + (m?.apuntadas ?? 0), 0);
  const acotados = Object.values(maestria).filter((m) => m?.deSiempre > m?.games - (m?.apuntadas ?? 0)).length;
  if (!entorno.sinDatosPersonales) inf.linea(`Tu maestría: ${sumadas} partidas apuntadas con la app; lo de siempre cuenta como mucho ${TOPE_DE_SIEMPRE} partidas por héroe (${acotados} héroes acotados)`);
  const sinCasar = Object.keys(maestria).filter((k) => !datos.heroes.some((x) => nombreClave(x.name) === nombreClave(k)));
  inf.check(!sinCasar.length, 'Todos los nombres de tu maestría casan con el catálogo',
    `Nombres de tu maestría que no casan con ningún héroe: ${sinCasar.slice(0, 6).join(', ')}`);
}

/** Las partidas apuntadas: calibración de la estimación y el Veredicto. */
export function seccionPartidas(inf, { partidas = [], maestria = {}, maestriaManual = null, entorno = {} }) {
  inf.seccion('TUS PARTIDAS');
  // La referencia del Veredicto sale de la maestría MANUAL más las previas,
  // nunca de la efectiva: esa lleva dentro las partidas comparadas.
  const reg = resumen(partidas, maestriaManual ?? maestria);
  const sin = !!entorno.sinDatosPersonales;
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  if (!sin) {
    const conBaneos = (partidas ?? []).filter((p) => Array.isArray(p.bans) && p.bans.length).length;
    inf.linea(`Partidas con baneos apuntados: ${conBaneos} de ${(partidas ?? []).length} (co-ocurrencia de baneos de tu rango)`);
    const lec = aciertosDelLector(partidas);
    const top = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, k]) => `${n} ${k}`).join(', ');
    if (lec.partidas) inf.linea(`Lector de la tablet: ${lec.partidas} partidas · ${lec.acertados} de ${lec.leidos} nombres seguían al apuntar (${Math.round(lec.acierto * 100)}%)${Object.keys(lec.fallos).length ? ` · quitados: ${top(lec.fallos)}` : ''}${Object.keys(lec.dudas ?? {}).length ? ` · dudas: ${top(lec.dudas)}` : ''}${Object.keys(lec.aprendidos ?? {}).length ? ` · aprendidos: ${top(lec.aprendidos)}` : ''}${Object.keys(lec.sinEncontrar ?? {}).length ? ` · sin encontrar: ${top(lec.sinEncontrar)}` : ''}${lec.tiempos ? ` · lectura ${(lec.tiempos.mediana / 1000).toFixed(1)} s (captura ${lec.tiempos.medianaCaptura != null ? (lec.tiempos.medianaCaptura / 1000).toFixed(1) : '?'} s)` : ''}${lec.tiempos?.crudo ? ` · sin comprimir ${(lec.tiempos.crudo.mediana / 1000).toFixed(1)} s, comprimida ${lec.tiempos.png ? `${(lec.tiempos.png.mediana / 1000).toFixed(1)} s` : '?'}` : ''}`);
    const cal = calibracion(partidas);
    if (cal.n) {
      inf.linea(`Estimación vs realidad: ${cal.n} partidas · previsto ${pct(cal.prevista)} · ganadas ${pct(cal.real)} · Brier ${cal.brier.toFixed(3)} (moneda 0.250)`);
      inf.linea(`  con ≥50% ganadas ${pct(cal.altas.real)} de ${cal.altas.n} · con <50% ganadas ${pct(cal.bajas.real)} de ${cal.bajas.n}`);
      // Por modelo (3.60.3): mezclados, el Brier medía tres modelos a la vez.
      const hoy = cal.porModelo?.[cal.actual];
      if (hoy && hoy.n < cal.n) inf.linea(`  con el modelo de hoy (${cal.actual}): ${hoy.n} partidas · previsto ${pct(hoy.prevista)} · ganadas ${pct(hoy.real)} · Brier ${hoy.brier.toFixed(3)}${hoy.deducidas ? ` (${hoy.deducidas} con el modelo deducido por la fecha)` : ''}`);
      if (cal.concluyente) {
        inf.check(!cal.peorQueMoneda, `La estimación no acierta menos que una moneda en tus partidas (Brier ${cal.brier.toFixed(3)} ± ${(1.96 * cal.brierSE).toFixed(3)})`,
          `La estimación acierta MENOS que una moneda en tus ${cal.n} partidas (Brier ${cal.brier.toFixed(3)} ± ${(1.96 * cal.brierSE).toFixed(3)}): no te fíes del porcentaje`, true);
      } else {
        inf.linea(`  faltan ${cal.faltan} partidas con estimación para juzgarla`);
      }
    }
  }
  inf.linea(sin ? 'Sin acceso: las partidas viven en el móvil' : `Apuntadas: ${reg.total}`);
  if (sin) return;
  if (reg.total) {
    inf.linea(`Siguiendo la recomendación: ${reg.siguiendo} · ganadas ${pct(reg.wrSiguiendo)}`);
    inf.linea(`Por libre: ${reg.porLibre} · ganadas ${pct(reg.wrPorLibre)}`);
  }
  // Líneas, no avisos: no hay nada que arreglar, es que aún no has jugado bastante.
  if (reg.entreRamas) {
    const e = reg.entreRamas;
    inf.linea(`Siguiendo menos por libre: ${e.dif >= 0 ? '+' : ''}${(e.dif * 100).toFixed(1)} puntos ± ${(e.margen * 100).toFixed(1)} (${MINIMO_PARA_CONCLUIR}+ en cada rama)`);
    inf.linea(e.seVe ? 'Esa diferencia ya se distingue del azar (sin aleatorizar: tú eliges cuándo hacer caso)' : 'Esa diferencia cabe en el azar: todavía no se sabe cuál de las dos va mejor');
  } else {
    inf.linea(`Siguiendo/por libre: faltan ${reg.faltan}, y la rama "por libre" solo crece si ignoras la app a propósito`);
  }
  if (reg.contraReferencia) {
    const c = reg.contraReferencia;
    inf.linea(`Contra tu winrate de siempre (${(c.base * 100).toFixed(1)}% en ${c.partidasBase} partidas): ${c.dif >= 0 ? '+' : ''}${(c.dif * 100).toFixed(1)} puntos ± ${(c.margen * 100).toFixed(1)}`);
    inf.linea(c.seVe ? 'Esa diferencia ya se distingue del azar'
      : `Aún no se distingue del azar: harían falta ${c.faltan == null ? 'sin cifra (diferencia nula)' : `~${c.faltan}`} partidas más siguiendo la app`);
  } else if (reg.siguiendo < 5 && !reg.referencia) {
    inf.linea('Sin maestría apuntada no hay contra qué comparar: rellena "Tu maestría"');
  }
}

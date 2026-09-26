import { nombreClave, buscar } from '../nombres.js';
import { ordenarPicks } from '../ranking.js';
import { notaDeMaestria } from '../maestria.js';
import { resumen, calibracion, MINIMO_PARA_CONCLUIR } from '../registro.js';

/**
 * Lo tuyo: la maestría y las partidas apuntadas. En la vigilancia automática
 * no hay móvil, así que con `entorno.sinDatosPersonales` no son avisos: si lo
 * fueran, todos los informes automáticos vendrían con avisos y dejaríamos de
 * leerlos.
 *
 * @param {import('./informe.js').Informe} inf
 */
export function seccionMaestria(inf, { datos, linea, maestria = {}, entorno = {} }) {
  const pool = datos.poolsPorLinea[linea] ?? [];
  inf.seccion('MAESTRÍA');
  const conMaestria = Object.keys(maestria ?? {}).length;
  if (entorno.sinDatosPersonales) inf.linea('Sin acceso: la maestría vive en el móvil');
  else inf.check(conMaestria >= 5, `${conMaestria} héroes con datos tuyos`, `Solo ${conMaestria} héroes con datos tuyos: rellena más para que la app se ajuste a ti`, true);
  if (!conMaestria) return;
  // Cuántas partidas apuntadas ya cuentan en tu maestría (3.13.0): las de
  // después de la fecha de cada héroe escrito a mano, más las de héroes que
  // solo tienen partidas apuntadas.
  const sumadas = Object.values(maestria).reduce((n, m) => n + (m?.apuntadas ?? 0), 0);
  if (!entorno.sinDatosPersonales) inf.linea(`Partidas apuntadas sumadas a tu maestría escrita a mano: ${sumadas}`);
  // TODO nombre guardado tiene que casar con el catálogo (antes solo se
  // miraba la primera clave).
  const sinCasar = Object.keys(maestria).filter((k) => !datos.heroes.some((x) => nombreClave(x.name) === nombreClave(k)));
  inf.check(!sinCasar.length, 'Todos los nombres de tu maestría casan con el catálogo',
    `Nombres de tu maestría que no casan con ningún héroe: ${sinCasar.slice(0, 6).join(', ')}`);
  const clave = Object.keys(maestria).find((k) => !sinCasar.includes(k));
  const h = clave ? datos.heroes.find((x) => nombreClave(x.name) === nombreClave(clave)) : null;
  if (!h) return;
  const sin = ordenarPicks(pool, { meta: datos.meta }).findIndex((r) => r.heroe.name === h.name);
  const con = ordenarPicks(pool, { meta: datos.meta, maestria }).findIndex((r) => r.heroe.name === h.name);
  const m = buscar(maestria, h.name);
  inf.linea(`Ejemplo: ${h.name} ${Math.round(m.winRate * 100)}% en ${m.games} partidas · puesto ${sin + 1} -> ${con + 1}`);
  inf.check(notaDeMaestria(h, maestria).valor !== 0.5, 'Tu maestría se está aplicando', 'Tu maestría NO se aplica: los nombres guardados no casan con el catálogo');
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
    const cal = calibracion(partidas);
    if (cal.n) {
      inf.linea(`Estimación vs realidad: ${cal.n} partidas · previsto ${pct(cal.prevista)} · ganadas ${pct(cal.real)} · Brier ${cal.brier.toFixed(3)} (moneda 0.250)`);
      inf.linea(`  con ≥50% ganadas ${pct(cal.altas.real)} de ${cal.altas.n} · con <50% ganadas ${pct(cal.bajas.real)} de ${cal.bajas.n}`);
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
  inf.linea(reg.concluyente
    ? `Siguiendo/por libre: hay muestra en las dos ramas (${MINIMO_PARA_CONCLUIR}+ de cada)`
    : `Siguiendo/por libre: faltan ${reg.faltan}, y la rama "por libre" solo crece si ignoras la app a propósito`);
  if (reg.contraReferencia) {
    const c = reg.contraReferencia;
    inf.linea(`Contra tu winrate de siempre (${(c.base * 100).toFixed(1)}% en ${c.partidasBase} partidas): ${c.dif >= 0 ? '+' : ''}${(c.dif * 100).toFixed(1)} puntos ± ${(c.margen * 100).toFixed(1)}`);
    inf.linea(c.seVe ? 'Esa diferencia ya se distingue del azar'
      : `Aún no se distingue del azar: harían falta ${c.faltan == null ? 'sin cifra (diferencia nula)' : `~${c.faltan}`} partidas más siguiendo la app`);
  } else if (reg.siguiendo < 5 && !reg.referencia) {
    inf.linea('Sin maestría apuntada no hay contra qué comparar: rellena "Tu maestría"');
  }
}

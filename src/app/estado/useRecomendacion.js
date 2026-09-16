import { useDeferredValue, useMemo } from 'react';
import {
  poolDe, lineasEnemigasAbiertas, rivalDeLinea, contextoDe, simular, composicionDe, aconsejar,
  baneosSugeridos, siguientesBaneos, estimarCon,
} from '../../motor/draft.js';
import { ordenarPicks, empatados } from '../../motor/ranking.js';
import { analizarDraft } from '../../motor/analisis.js';
import { cobertura } from '../../motor/matrices.js';
import { coocurrenciaDeBaneos } from '../../motor/baneos.js';

/**
 * Todo lo que la app enseña, calculado con el motor (src/motor/draft.js) y
 * memorizado pieza a pieza: el ranking va con cada toque; la simulación de
 * finales (60 rankings) va DIFERIDA para no bloquear el toque, y lleva la
 * marca del draft para el que se hizo (sin ella, el análisis cruzaba la
 * cuota del draft anterior con el nº1 nuevo).
 *
 * @param {object} d
 * @param d.datos        lo que devuelve prepararDatos
 * @param d.linea
 * @param d.enemigos     héroes (ya resueltos)
 * @param d.aliados
 * @param d.baneos
 * @param d.rivalMarcado nombre o null
 * @param d.maestria     la que ve el motor (maestriaUsada)
 * @param d.partidas     para la co-ocurrencia de baneos
 */
export function useRecomendacion({ datos, linea, enemigos, aliados, baneos, rivalMarcado, maestria, partidas }) {
  const pool = useMemo(() => poolDe(datos, linea), [datos, linea]);
  const cov = useMemo(() => cobertura(pool, datos.meta.stats, datos.meta.counters), [pool, datos]);
  const lineasAbiertas = useMemo(() => lineasEnemigasAbiertas(datos, enemigos), [datos, enemigos]);
  const rival = useMemo(() => rivalDeLinea(datos, { linea, enemigos, marcado: rivalMarcado }), [datos, linea, enemigos, rivalMarcado]);

  const ranking = useMemo(
    () => (datos.catalogo ? ordenarPicks(pool, contextoDe(datos, { enemigos, aliados, baneos, maestria, lineasAbiertas })) : []),
    [datos, pool, enemigos, aliados, baneos, maestria, lineasAbiertas],
  );
  const empate = useMemo(() => empatados(ranking), [ranking]);
  const yo = ranking[0]?.heroe ?? null;

  const enemigosDiferidos = useDeferredValue(enemigos);
  const aliadosDiferidos = useDeferredValue(aliados);
  const baneosDiferidos = useDeferredValue(baneos);
  const robustez = useMemo(
    () => simular(datos, { linea, enemigos: enemigosDiferidos, aliados: aliadosDiferidos, baneos: baneosDiferidos, maestria }),
    [datos, linea, enemigosDiferidos, aliadosDiferidos, baneosDiferidos, maestria],
  );

  const composicion = useMemo(() => composicionDe({ aliados, enemigos, yo }), [aliados, enemigos, yo]);
  const consejos = useMemo(() => aconsejar(datos, { linea, yo, enemigos, aliados, baneos, lineasAbiertas }), [datos, linea, yo, enemigos, aliados, baneos, lineasAbiertas]);
  const analisis = useMemo(
    () => analizarDraft({ ranking, enemigos, aliados, meta: datos.meta, rivalDeLinea: rival.nombre, empate, robustez, composicion }),
    [ranking, enemigos, aliados, datos, rival, empate, robustez, composicion],
  );
  const sugeridos = useMemo(() => (datos.catalogo ? baneosSugeridos(datos, { aliados, enemigos, baneos }) : []), [datos, aliados, enemigos, baneos]);
  const coocurrencia = useMemo(() => coocurrenciaDeBaneos(partidas), [partidas]);
  const proximos = useMemo(
    () => (datos.catalogo ? siguientesBaneos(datos, { baneos, enemigos, aliados, historial: coocurrencia, n: 10 }) : []),
    [datos, baneos, enemigos, aliados, coocurrencia],
  );

  /** La probabilidad con UN héroe concreto (el que apuntas, aunque no sea el nº1). */
  const estimacionCon = (heroe) => ranking.find((r) => r.heroe === heroe) ?? estimarCon(datos, { yo: heroe, enemigos, aliados, baneos, maestria });

  return { pool, cov, lineasAbiertas, rival, ranking, empate, yo, robustez, composicion, consejos, analisis, baneosSugeridos: sugeridos, proximos, estimacionCon };
}

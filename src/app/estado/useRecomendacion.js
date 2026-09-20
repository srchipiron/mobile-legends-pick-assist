import { useDeferredValue, useMemo } from 'react';
import {
  poolDe, lineasEnemigasAbiertas, rivalDeLinea, contextoDe, simular, composicionDe, aconsejar,
  baneosSugeridos, siguientesBaneos, estimarCon, eleccionDe, planDePicks,
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
 * @param d.miPick       tu pick fijado (héroe) o null: de él hablan el análisis, la composición y el consejo
 * @param d.maestria     la que ve el motor (maestriaUsada)
 * @param d.partidas     para la co-ocurrencia de baneos
 */
export function useRecomendacion({ datos, linea, enemigos, aliados, baneos, rivalMarcado, miPick = null, maestria, partidas }) {
  const pool = useMemo(() => poolDe(datos, linea), [datos, linea]);
  const cov = useMemo(() => cobertura(pool, datos.meta.stats, datos.meta.counters), [pool, datos]);
  const lineasAbiertas = useMemo(() => lineasEnemigasAbiertas(datos, enemigos), [datos, enemigos]);
  const rival = useMemo(() => rivalDeLinea(datos, { linea, enemigos, marcado: rivalMarcado }), [datos, linea, enemigos, rivalMarcado]);

  const ranking = useMemo(
    () => (datos.catalogo ? ordenarPicks(pool, contextoDe(datos, { enemigos, aliados, baneos, maestria, lineasAbiertas })) : []),
    [datos, pool, enemigos, aliados, baneos, maestria, lineasAbiertas],
  );
  const empate = useMemo(() => empatados(ranking), [ranking]);
  // Tu pick: el fijado si está en el ranking, si no el nº1.
  const eleccion = useMemo(() => eleccionDe(ranking, miPick), [ranking, miPick]);
  const yo = eleccion?.heroe ?? null;

  const enemigosDiferidos = useDeferredValue(enemigos);
  const aliadosDiferidos = useDeferredValue(aliados);
  const baneosDiferidos = useDeferredValue(baneos);
  const robustez = useMemo(
    () => simular(datos, { linea, enemigos: enemigosDiferidos, aliados: aliadosDiferidos, baneos: baneosDiferidos, maestria }),
    [datos, linea, enemigosDiferidos, aliadosDiferidos, baneosDiferidos, maestria],
  );

  const composicion = useMemo(() => composicionDe({ aliados, enemigos, yo }), [aliados, enemigos, yo]);
  // El consejo a los compañeros son cuatro rankings más (medido: el doble
  // que el tuyo, 40 ms aquí y 160-250 en un móvil) y va plegado: DIFERIDO,
  // como la simulación, y con su propio `yo` para que lo que se enseñe sea
  // coherente consigo mismo aunque vaya un render por detrás (sin la marca,
  // enseñaría el consejo de un draft con el nº1 de otro).
  const yoDiferido = useDeferredValue(yo);
  const listaConsejos = useMemo(
    () => aconsejar(datos, { linea, yo: yoDiferido, enemigos: enemigosDiferidos, aliados: aliadosDiferidos, baneos: baneosDiferidos }),
    [datos, linea, yoDiferido, enemigosDiferidos, aliadosDiferidos, baneosDiferidos],
  );
  const consejos = useMemo(() => ({ lista: listaConsejos, yo: yoDiferido }), [listaConsejos, yoDiferido]);
  const analisis = useMemo(
    () => analizarDraft({ eleccion, ranking, enemigos, aliados, baneos, meta: datos.meta, rivalDeLinea: rival.nombre, empate, robustez, composicion }),
    [eleccion, ranking, enemigos, aliados, baneos, datos, rival, empate, robustez, composicion],
  );
  // Tu plan antes de que salga nadie (fase de baneos): el ranking con el draft vacío.
  const plan = useMemo(() => (datos.catalogo ? planDePicks(datos, { linea, maestria }) : []), [datos, linea, maestria]);
  const sugeridos = useMemo(() => (datos.catalogo ? baneosSugeridos(datos, { aliados, enemigos, baneos }) : []), [datos, aliados, enemigos, baneos]);
  const coocurrencia = useMemo(() => coocurrenciaDeBaneos(partidas), [partidas]);
  const proximos = useMemo(
    () => (datos.catalogo ? siguientesBaneos(datos, { baneos, enemigos, aliados, historial: coocurrencia, n: 10 }) : []),
    [datos, baneos, enemigos, aliados, coocurrencia],
  );

  /** La probabilidad con UN héroe concreto (el que apuntas, aunque no sea el nº1). */
  const estimacionCon = (heroe) => ranking.find((r) => r.heroe === heroe) ?? estimarCon(datos, { yo: heroe, enemigos, aliados, baneos, maestria });

  return { pool, cov, lineasAbiertas, rival, ranking, empate, eleccion, yo, robustez, composicion, consejos, analisis, plan, baneosSugeridos: sugeridos, proximos, estimacionCon };
}

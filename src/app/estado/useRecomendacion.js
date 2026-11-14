import { useDeferredValue, useMemo } from 'react';
import {
  poolDe, lineasEnemigasAbiertas, rivalDeLinea, contextoDe, simular, composicionDe, aconsejar,
  baneosSugeridos, siguientesBaneos, estimarCon, eleccionDe, planDePicks, planear,
} from '../../motor/draft.js';
import { ordenarPicks, empatados } from '../../motor/ranking.js';
import { analizarDraft } from '../../motor/analisis.js';
import { cobertura } from '../../motor/matrices.js';
import { coocurrenciaDeBaneos } from '../../motor/baneos.js';

/**
 * Lo que la app enseña, calculado con el motor (draft.js, el único cerebro)
 * y memorizado pieza a pieza. El ranking va con cada toque; la simulación y
 * el consejo a los compañeros van DIFERIDOS [M: 40 ms aquí, 160–250 en un
 * móvil] y con su propio `yo`, para no cruzar un draft con el nº1 de otro.
 * Tus resultados no cuentan en nada (decisión de Javi): sin maestría.
 *
 * @param d.enemigos / d.aliados / d.baneos  héroes ya resueltos
 * @param d.miPick    tu pick fijado (héroe) o null: de él hablan el análisis, la composición y el consejo
 * @param d.partidas  para la co-ocurrencia de baneos de tu historial
 */
export function useRecomendacion({ datos, linea, enemigos, aliados, baneos, rivalMarcado, miPick = null, partidas }) {
  const pool = useMemo(() => poolDe(datos, linea), [datos, linea]);
  const cov = useMemo(() => cobertura(pool, datos.meta.stats, datos.meta.counters), [pool, datos]);
  const lineasAbiertas = useMemo(() => lineasEnemigasAbiertas(datos, enemigos), [datos, enemigos]);
  const rival = useMemo(() => rivalDeLinea(datos, { linea, enemigos, marcado: rivalMarcado }), [datos, linea, enemigos, rivalMarcado]);
  const ranking = useMemo(
    () => (datos.catalogo ? ordenarPicks(pool, contextoDe(datos, { enemigos, aliados, baneos, lineasAbiertas })) : []),
    [datos, pool, enemigos, aliados, baneos, lineasAbiertas],
  );
  const empate = useMemo(() => empatados(ranking), [ranking]);
  const eleccion = useMemo(() => eleccionDe(ranking, miPick), [ranking, miPick]);
  const yo = eleccion?.heroe ?? null;

  const enemigosDiferidos = useDeferredValue(enemigos);
  const aliadosDiferidos = useDeferredValue(aliados);
  const baneosDiferidos = useDeferredValue(baneos);
  const yoDiferido = useDeferredValue(yo);
  const robustez = useMemo(
    () => simular(datos, { linea, enemigos: enemigosDiferidos, aliados: aliadosDiferidos, baneos: baneosDiferidos }),
    [datos, linea, enemigosDiferidos, aliadosDiferidos, baneosDiferidos],
  );
  const listaConsejos = useMemo(
    () => aconsejar(datos, { linea, yo: yoDiferido, enemigos: enemigosDiferidos, aliados: aliadosDiferidos, baneos: baneosDiferidos }),
    [datos, linea, yoDiferido, enemigosDiferidos, aliadosDiferidos, baneosDiferidos],
  );
  const consejos = useMemo(() => ({ lista: listaConsejos, yo: yoDiferido }), [listaConsejos, yoDiferido]);

  const composicion = useMemo(() => composicionDe({ aliados, enemigos, yo }), [aliados, enemigos, yo]);
  const analisis = useMemo(
    () => analizarDraft({ eleccion, ranking, enemigos, aliados, baneos, meta: datos.meta, rivalDeLinea: rival.nombre, empate, robustez, composicion }),
    [eleccion, ranking, enemigos, aliados, baneos, datos, rival, empate, robustez, composicion],
  );
  // Tu plan antes de que salga nadie (fase de baneos): el ranking con el draft vacío.
  const plan = useMemo(() => (datos.catalogo ? planDePicks(datos, { linea }) : []), [datos, linea]);
  const sugeridos = useMemo(() => (datos.catalogo ? baneosSugeridos(datos, { aliados, enemigos, baneos, miPick }) : []), [datos, aliados, enemigos, baneos, miPick]);
  const coocurrencia = useMemo(() => coocurrenciaDeBaneos(partidas), [partidas]);
  const proximos = useMemo(
    () => (datos.catalogo ? siguientesBaneos(datos, { baneos, enemigos, aliados, miPick, historial: coocurrencia, n: 10 }) : []),
    [datos, baneos, enemigos, aliados, miPick, coocurrencia],
  );
  // El plan de partida del héroe del que se habla, para el diagnóstico y las fases de la partida apuntada.
  const partida = useMemo(() => planear(datos, { yo, aliados, enemigos, linea, baneos, rivalMarcado }), [datos, yo, aliados, enemigos, linea, baneos, rivalMarcado]);

  /** La probabilidad con UN héroe concreto (el que apuntas, aunque no sea el nº1). */
  const estimacionCon = (heroe) => ranking.find((r) => r.heroe === heroe) ?? estimarCon(datos, { yo: heroe, enemigos, aliados, baneos });

  return { pool, cov, lineasAbiertas, rival, ranking, empate, eleccion, yo, robustez, composicion, consejos, analisis, plan, partida, baneosSugeridos: sugeridos, proximos, estimacionCon };
}

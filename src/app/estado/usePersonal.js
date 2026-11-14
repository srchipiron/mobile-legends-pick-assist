import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { sanear, sanearOlvidadas } from '../../motor/perfil.js';
import { apuntar, olvidar, corregir, cambiarHeroe, cambiarDraft, marcarEditada, esFantasma } from '../../motor/registro.js';
import { maestriaEfectiva, fecharMaestria } from '../../motor/maestria.js';
import { sanearComprobadas } from '../../motor/comprobacion.js';

/**
 * Lo tuyo: la maestría escrita a mano, las partidas, las quitadas (viajan
 * para que fundir no las resucite) y lo comprobado de la tablet. Todo se
 * sanea al cargar, como un perfil importado. Cada lista vive también en una
 * referencia: se escribe sobre la última y se guarda FUERA de los updaters.
 * `maestriaUsada` = la de a mano más la que sale de las partidas apuntadas.
 */
export function usePersonal() {
  const [maestria, setMaestria] = useState(() => sanear({ mastery: leer(CLAVES.maestria, {}) }).mastery);
  const [partidas, setPartidas] = useState(() => sanear({ partidas: leer(CLAVES.partidas, []) }).partidas);
  const [olvidadas, setOlvidadas] = useState(() => sanearOlvidadas(leer(CLAVES.olvidadas, [])));
  const [comprobadas, setComprobadas] = useState(() => sanearComprobadas(leer(CLAVES.comprobadas, [])));
  const ultimas = useRef(partidas);
  const ultimasOlvidadas = useRef(olvidadas);
  const ultimasComprobadas = useRef(comprobadas);
  const maestriaUsada = useMemo(() => maestriaEfectiva(maestria, partidas), [maestria, partidas]);

  const guardarMaestria = useCallback((siguiente) => { setMaestria(siguiente); guardar(CLAVES.maestria, siguiente); }, []);
  const guardarPartidas = useCallback((siguiente) => { ultimas.current = siguiente; setPartidas(siguiente); guardar(CLAVES.partidas, siguiente); }, []);
  const guardarOlvidadas = useCallback((siguiente) => { ultimasOlvidadas.current = siguiente; setOlvidadas(siguiente); guardar(CLAVES.olvidadas, siguiente); }, []);

  // La maestría sin fecha se fecha al verla: desde ahí, lo que apuntes se le suma.
  useEffect(() => {
    const fechada = fecharMaestria(maestria);
    if (fechada !== maestria) guardarMaestria(fechada);
  }, [maestria, guardarMaestria]);

  const apuntarPartida = useCallback((entrada) => guardarPartidas(apuntar(ultimas.current, entrada)), [guardarPartidas]);
  /** Quitar deja marca: sin ella, otro móvil o la base de datos la devolvían al fundir. */
  const olvidarPartida = useCallback((t) => {
    guardarOlvidadas(sanearOlvidadas([t, ...ultimasOlvidadas.current]));
    guardarPartidas(olvidar(ultimas.current, t));
  }, [guardarPartidas, guardarOlvidadas]);
  // Las fantasma de la tablet se quitan solas, con su marca: así se borran también de la base de datos.
  useEffect(() => {
    const fantasmas = partidas.filter(esFantasma).map((p) => p.t);
    if (!fantasmas.length) return;
    guardarOlvidadas(sanearOlvidadas([...fantasmas, ...ultimasOlvidadas.current]));
    guardarPartidas(ultimas.current.filter((p) => !esFantasma(p)));
  }, [partidas, guardarPartidas, guardarOlvidadas]);

  // Cada arreglo lleva su hora (`editada`): así llega a la tablet y no lo pisa la copia de allí.
  const arreglar = useCallback((t, cambio) => guardarPartidas(marcarEditada(cambio(ultimas.current), t)), [guardarPartidas]);
  const corregirPartida = useCallback((t, gane) => arreglar(t, (l) => corregir(l, t, gane)), [arreglar]);
  const cambiarHeroePartida = useCallback((t, pick) => arreglar(t, (l) => cambiarHeroe(l, t, pick)), [arreglar]);
  const cambiarDraftPartida = useCallback((t, cambios) => arreglar(t, (l) => cambiarDraft(l, t, cambios)), [arreglar]);
  /** Con las capturas del lector: tu pick y los dos equipos de una vez, con una sola hora de arreglo. */
  const revisarPartida = useCallback((t, { pick, enemigos, aliados }) => arreglar(t, (l) => cambiarDraft(cambiarHeroe(l, t, pick), t, { enemigos, aliados })), [arreglar]);

  /** Si la tablet acertó en una partida; lo que haya que arreglar lo arreglan los de arriba. */
  const comprobarPartida = useCallback((t, bien, que = null) => {
    const nuevas = sanearComprobadas([{ t, bien, que, cuando: Date.now() }, ...ultimasComprobadas.current]);
    ultimasComprobadas.current = nuevas;
    guardar(CLAVES.comprobadas, nuevas);
    setComprobadas(nuevas);
  }, []);

  /** Trae los datos de otro sitio, ya FUNDIDOS con los de aquí: solo guarda, no puede borrar nada. */
  const importarPerfil = useCallback((fundido) => {
    guardarMaestria(fundido.mastery);
    guardarPartidas(fundido.partidas);
    guardarOlvidadas(sanearOlvidadas(fundido.olvidadas));
  }, [guardarMaestria, guardarPartidas, guardarOlvidadas]);

  return {
    maestria, maestriaUsada, partidas, olvidadas, comprobadas, guardarMaestria, apuntarPartida, olvidarPartida,
    corregirPartida, cambiarHeroePartida, cambiarDraftPartida, revisarPartida, comprobarPartida, importarPerfil,
  };
}

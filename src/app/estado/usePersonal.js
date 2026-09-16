import { useCallback, useMemo, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { sanear } from '../../motor/perfil.js';
import { apuntar, olvidar, corregir } from '../../motor/registro.js';
import { maestriaEfectiva } from '../../motor/maestria.js';

/**
 * Lo tuyo: la maestría escrita a mano y las partidas apuntadas. Lo guardado
 * se sanea al cargar, igual que un perfil importado: un almacén con la forma
 * rota (una versión vieja, una edición a mano) reventaba la pantalla de
 * partidas en vez de degradarse.
 *
 * `maestriaUsada` es la que ve el motor: la manual MÁS la que sale de las
 * partidas apuntadas. Antes eran dos cosas que no se hablaban y apuntar
 * partidas no personalizaba nada.
 */
export function usePersonal() {
  const [maestria, setMaestria] = useState(() => sanear({ mastery: leer(CLAVES.maestria, {}) }).mastery);
  const [partidas, setPartidas] = useState(() => sanear({ partidas: leer(CLAVES.partidas, []) }).partidas);
  const maestriaUsada = useMemo(() => maestriaEfectiva(maestria, partidas), [maestria, partidas]);

  // La lista de partidas en una referencia, para poder apuntar sobre la última
  // sin leer un cierre viejo Y sin guardar dentro de un updater de estado:
  // React puede llamar a un updater más de una vez, y ahí dentro `guardar` es
  // un efecto secundario. El único que la escribe es `guardarPartidas`.
  const ultimas = useRef(partidas);

  const guardarMaestria = useCallback((siguiente) => { setMaestria(siguiente); guardar(CLAVES.maestria, siguiente); }, []);
  const guardarPartidas = useCallback((siguiente) => {
    ultimas.current = siguiente;
    setPartidas(siguiente);
    guardar(CLAVES.partidas, siguiente);
  }, []);

  const apuntarPartida = useCallback((entrada) => guardarPartidas(apuntar(ultimas.current, entrada)), [guardarPartidas]);
  const olvidarPartida = useCallback((t) => guardarPartidas(olvidar(ultimas.current, t)), [guardarPartidas]);
  const corregirPartida = useCallback((t, gane) => guardarPartidas(corregir(ultimas.current, t, gane)), [guardarPartidas]);

  /**
   * Trae los datos de otro dispositivo. Vienen ya FUNDIDOS con los de aquí
   * (`fundirPerfil`), así que esto solo guarda: no puede borrar nada.
   */
  const importarPerfil = useCallback((fundido) => {
    guardarMaestria(fundido.mastery);
    guardarPartidas(fundido.partidas);
  }, [guardarMaestria, guardarPartidas]);

  return { maestria, maestriaUsada, partidas, guardarMaestria, guardarPartidas, apuntarPartida, olvidarPartida, corregirPartida, importarPerfil };
}

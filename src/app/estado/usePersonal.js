import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { sanear, sanearOlvidadas } from '../../motor/perfil.js';
import { apuntar, olvidar, corregir } from '../../motor/registro.js';
import { maestriaEfectiva, fecharMaestria } from '../../motor/maestria.js';

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
  const [olvidadas, setOlvidadas] = useState(() => sanearOlvidadas(leer(CLAVES.olvidadas, [])));
  const ultimasOlvidadas = useRef(olvidadas);
  const maestriaUsada = useMemo(() => maestriaEfectiva(maestria, partidas), [maestria, partidas]);

  // La lista de partidas en una referencia, para poder apuntar sobre la última
  // sin leer un cierre viejo Y sin guardar dentro de un updater de estado:
  // React puede llamar a un updater más de una vez, y ahí dentro `guardar` es
  // un efecto secundario. El único que la escribe es `guardarPartidas`.
  const ultimas = useRef(partidas);

  const guardarMaestria = useCallback((siguiente) => { setMaestria(siguiente); guardar(CLAVES.maestria, siguiente); }, []);

  // La maestría sin fecha (guardada antes de 3.13.0 o traída de un código
  // viejo) se fecha al verla: desde ahí, lo que apuntes se le suma
  // (motor/maestria.js, fecharMaestria). Fuera de cualquier updater.
  useEffect(() => {
    const fechada = fecharMaestria(maestria);
    if (fechada !== maestria) guardarMaestria(fechada);
  }, [maestria, guardarMaestria]);
  const guardarPartidas = useCallback((siguiente) => {
    ultimas.current = siguiente;
    setPartidas(siguiente);
    guardar(CLAVES.partidas, siguiente);
  }, []);

  const apuntarPartida = useCallback((entrada) => guardarPartidas(apuntar(ultimas.current, entrada)), [guardarPartidas]);
  const guardarOlvidadas = useCallback((siguiente) => {
    ultimasOlvidadas.current = siguiente;
    setOlvidadas(siguiente);
    guardar(CLAVES.olvidadas, siguiente);
  }, []);
  // Quitar deja marca: sin ella, un código viejo (o la base de datos del
  // proyecto) devolvía la partida al fundir.
  const olvidarPartida = useCallback((t) => {
    guardarOlvidadas(sanearOlvidadas([t, ...ultimasOlvidadas.current]));
    guardarPartidas(olvidar(ultimas.current, t));
  }, [guardarPartidas, guardarOlvidadas]);
  const corregirPartida = useCallback((t, gane) => guardarPartidas(corregir(ultimas.current, t, gane)), [guardarPartidas]);

  /**
   * Trae los datos de otro dispositivo. Vienen ya FUNDIDOS con los de aquí
   * (`fundirPerfil`), así que esto solo guarda: no puede borrar nada.
   */
  const importarPerfil = useCallback((fundido) => {
    guardarMaestria(fundido.mastery);
    guardarPartidas(fundido.partidas);
    guardarOlvidadas(sanearOlvidadas(fundido.olvidadas));
  }, [guardarMaestria, guardarPartidas, guardarOlvidadas]);

  return { maestria, maestriaUsada, partidas, olvidadas, guardarMaestria, guardarPartidas, apuntarPartida, olvidarPartida, corregirPartida, importarPerfil };
}

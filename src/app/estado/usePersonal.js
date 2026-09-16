import { useCallback, useMemo, useState } from 'react';
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

  const guardarMaestria = useCallback((siguiente) => { setMaestria(siguiente); guardar(CLAVES.maestria, siguiente); }, []);
  const guardarPartidas = useCallback((siguiente) => { setPartidas(siguiente); guardar(CLAVES.partidas, siguiente); }, []);

  const apuntarPartida = useCallback((entrada) => setPartidas((prev) => {
    const siguiente = apuntar(prev, entrada);
    guardar(CLAVES.partidas, siguiente);
    return siguiente;
  }), []);
  const olvidarPartida = useCallback((t) => setPartidas((prev) => { const s = olvidar(prev, t); guardar(CLAVES.partidas, s); return s; }), []);
  const corregirPartida = useCallback((t, gane) => setPartidas((prev) => { const s = corregir(prev, t, gane); guardar(CLAVES.partidas, s); return s; }), []);

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

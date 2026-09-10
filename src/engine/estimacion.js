import { evaluarDraft, mediaDeSinergia } from './modelo.js';

/**
 * ¿Cuánto hay de ganar esta partida, con estos diez?
 *
 * Desde 2.0 es EL MISMO modelo con el que se ordenan los picks (modelo.js):
 * la estimación que enseña la app es la del nº1, y la que se guarda con cada
 * partida apuntada es la del héroe que cogiste. Con la escala medida en las
 * partidas profesionales (0.44 ± 0.12) ya no exagera: el Brier fuera de
 * muestra pasa de 0.2510 (peor que una moneda) a 0.2435. Lo que sigue sin
 * saberse es si en TU cola vale lo mismo que en pro: cada partida apuntada
 * guarda la estimación y `calibracion()` (registro.js) compara lo previsto
 * con lo que pasó.
 */
export function estimarVictoria(args = {}) {
  return evaluarDraft(args);
}

export { mediaDeSinergia };

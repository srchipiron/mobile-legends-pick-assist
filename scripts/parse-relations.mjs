/**
 * Lectura de las respuestas de counters y compatibilidad. RE-EXPORT FINO: lo
 * que hay vive en scripts/ingesta/relaciones.mjs. Este fichero se queda por los
 * que ya lo importaban (scripts/test-engine.mjs).
 */

export {
  NAME_KEYS, ID_KEYS, MAX_HERO_ID, esIdDeHeroe, idPrincipal, DELTA_KEYS, ABS_KEYS,
  asRate, pick, recogerPares, relationMap, heroeDelRegistro,
} from './ingesta/relaciones.mjs';

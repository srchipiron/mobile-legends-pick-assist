import { tic } from '../tacto.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * «Leer del juego» (3.25.0): pide al lector de Termux lo que hay en la
 * pantalla del draft de la tablet y lo mete en el draft. Lo que sale bien
 * se dice en el aviso con «Deshacer»; lo que sale mal, aquí debajo, con lo
 * que hay que hacer.
 */
export function BotonLector({ estado = 'libre', aviso = null, onLeer, t = tPorDefecto }) {
  const leyendo = estado === 'leyendo';
  return (
    <>
      <button className="reset lector" disabled={leyendo} aria-busy={leyendo} onClick={() => { tic(); onLeer(); }}>
        {leyendo ? t('lector.leyendo') : t('lector.boton')}
      </button>
      {aviso && <p className="lector-aviso" role="alert">{t(`lector.${aviso}`)}</p>}
    </>
  );
}

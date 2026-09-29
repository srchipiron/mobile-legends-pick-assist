import { tic } from '../tacto.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * «Deshacer» (3.23.0): el aviso que queda abajo tras vaciar el draft con
 * «Nuevo draft» o quitar a alguien con la ×. Un toque en falso a mitad de
 * partida ya no se lleva el draft: se recupera tal cual estaba (orden,
 * rival marcado, pick fijado, fase). Se va solo a los `DESHACER_MS` o en
 * cuanto cambias otra cosa del draft.
 *
 * Va montado en App, fuera de todo lo que se transforma o se anima: es
 * `position: fixed` y un antecesor con `transform` lo encerraría.
 */
export function AvisoDeshacer({ deshacible, onDeshacer, onCerrar, t = tPorDefecto }) {
  if (!deshacible) return null;
  const texto = deshacible.tipo === 'quitado' ? t('deshacer.quitado', { nombre: deshacible.nombre }) : t('deshacer.vaciado');
  return (
    <div className="aviso-deshacer" role="status">
      <span>{texto}</span>
      <button className="deshacer" onClick={() => { tic(); onDeshacer(); }}>{t('deshacer.boton')}</button>
      <button className="x" aria-label={t('app.cerrar')} onClick={onCerrar}>×</button>
    </div>
  );
}

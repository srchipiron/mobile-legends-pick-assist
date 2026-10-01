import { tic } from '../tacto.js';
import { tPorDefecto } from './tPorDefecto.js';

/**
 * «Leer del juego» (3.25.0): pide al lector de Termux lo que hay en la
 * pantalla del draft de la tablet y lo mete en el draft. Lo que sale bien
 * se dice en el aviso con «Deshacer»; lo que sale mal, aquí debajo, con lo
 * que hay que hacer. Y «Solo» (3.28.0): la app lee sola cada pocos segundos
 * mientras el draft esté a medias; debajo, qué pasó con la última lectura.
 */
export function BotonLector({ estado = 'libre', aviso = null, ultimo = null, auto = false, onAuto = null, pantalla = null, onPantalla = null, onLeer, t = tPorDefecto }) {
  const leyendo = estado === 'leyendo';
  const estadoAuto = !auto ? null : !ultimo ? t('lector.autoBuscando') : ultimo.ok ? t('lector.autoLeido', { n: ultimo.nuevos }) : t(`lector.auto.${ultimo.tipo === 'sinPuente' ? 'sinPuente' : ultimo.tipo === 'tablet' || ultimo.tipo === 'emparejar' || ultimo.tipo === 'captura' ? 'tablet' : 'error'}`);
  return (
    <>
      <button className="reset lector" disabled={leyendo} aria-busy={leyendo} onClick={() => { tic(); onLeer(); }}>
        {leyendo ? t('lector.leyendo') : t('lector.boton')}
      </button>
      {onAuto && (
        <button className="reset lector-auto" aria-pressed={auto} onClick={() => { tic(); onAuto(!auto); }}>
          {t(auto ? 'lector.autoSi' : 'lector.autoNo')}
        </button>
      )}
      {estadoAuto && !aviso && <p className="lector-estado">{estadoAuto}</p>}
      {aviso && <p className="lector-aviso" role="alert">{t(`lector.${aviso}`)}</p>}
      {/* TEMPORAL (3.29.0): mandar la pantalla de resultado al proyecto, una ganada y una perdida, para medir el cartel. */}
      {onPantalla && (
        <details className="pantalla-resultado">
          <summary>{t('lector.pantalla.titulo')}</summary>
          <p>{t('lector.pantalla.ayuda')}</p>
          <div className="pantalla-botones">
            <button className="reset" disabled={pantalla?.estado === 'enviando'} onClick={() => { tic(); onPantalla('gane'); }}>{t('lector.pantalla.gane')}</button>
            <button className="reset" disabled={pantalla?.estado === 'enviando'} onClick={() => { tic(); onPantalla('perdi'); }}>{t('lector.pantalla.perdi')}</button>
          </div>
          {pantalla && <p className="lector-estado">{pantalla.estado === 'enviando' ? t('lector.pantalla.enviando') : pantalla.estado === 'ok' ? t('lector.pantalla.ok', { n: pantalla.numero ?? '' }) : t('lector.pantalla.error', { tipo: pantalla.tipo })}</p>}
        </details>
      )}
    </>
  );
}

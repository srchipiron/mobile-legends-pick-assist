import { tic } from '../tacto.js';
import { tPorDefecto } from './tPorDefecto.js';
import { claveDeFallo, lectorEnTablet } from '../lector.js';

/**
 * «Leer del juego» (3.25.0): pide al lector de Termux lo que hay en la
 * pantalla del draft de la tablet y lo mete en el draft. Lo que sale bien
 * se dice en el aviso con «Deshacer»; lo que sale mal, aquí debajo, con lo
 * que hay que hacer. Y «Solo» (3.28.0): la app lee sola cada pocos segundos
 * mientras el draft esté a medias; debajo, qué pasó con la última lectura.
 * Y si la voz de los consejos en directo no suena (3.44.0), por qué.
 */
export function BotonLector({ estado = 'libre', aviso = null, ultimo = null, voz = null, auto = false, onAuto = null, vozCallada = false, onVoz = null, onLeer, t = tPorDefecto }) {
  const leyendo = estado === 'leyendo';
  const estadoAuto = !auto ? null : !ultimo ? t('lector.autoBuscando') : ultimo.ok ? t('lector.autoLeido', { n: ultimo.nuevos }) : t(claveDeFallo(ultimo.tipo, { auto: true }));
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
      {/* Callar los consejos en directo (3.53.0): solo leyendo solo, que es cuando el lector habla. */}
      {auto && onVoz && <BotonVoz callada={vozCallada} onVoz={onVoz} t={t} />}
      {estadoAuto && !aviso && <p className="lector-estado">{estadoAuto}</p>}
      {aviso && <p className="lector-aviso" role="alert">{t(claveDeFallo(aviso))}</p>}
      {/* La voz de los consejos en directo (3.44.0): sin Termux:API no suena, y aquí se dice cómo arreglarlo. */}
      {auto && (voz === 'falta' || voz === 'otro') && <p className="lector-estado lector-voz">{t(lectorEnTablet() && voz === 'falta' ? 'lector.enTablet.vozFalta' : `lector.voz.${voz}`)}</p>}
    </>
  );
}

/** «Voz: sí / callada» (3.53.0): calla los consejos en directo del lector; lo que ya suena acaba su frase. */
export function BotonVoz({ callada = false, onVoz, t = tPorDefecto, style }) {
  return (
    <button className="reset lector-callar" style={style} aria-pressed={callada} onClick={() => { tic(); onVoz(!callada); }}>
      {t(callada ? 'lector.vozCallada' : 'lector.vozSi')}
    </button>
  );
}

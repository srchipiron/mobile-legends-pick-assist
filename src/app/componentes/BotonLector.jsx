import { tic } from '../tacto.js';
import { claveDeFallo } from '../lector.js';
import { useT } from '../i18n/contexto.js';

/**
 * «Leer del juego»: copia ahora el draft que lleva la tablet. «Leer solo»
 * lo copia cada pocos segundos con la app a la vista; debajo, qué pasó con
 * la última copia, o el fallo con lo que hay que hacer en la tablet.
 *
 * @param lector  { estado, aviso, ultimo, auto, onAuto, onLeer } (useLector + ajustes)
 * @param conAuto con el interruptor «Leer solo» en la fila (en baneos; en picks va en Ajustes)
 */
export function BotonLector({ lector, conAuto = false }) {
  const t = useT();
  const { estado = 'libre', aviso = null, ultimo = null, auto = false, onLeer } = lector;
  const leyendo = estado === 'leyendo';
  const estadoAuto = !auto ? null : !ultimo ? t('lector.autoBuscando') : ultimo.ok ? t('lector.autoLeido', { n: ultimo.nuevos }) : t(claveDeFallo(ultimo.tipo, { auto: true }));
  return (
    <>
      <button className="reset lector" disabled={leyendo} aria-busy={leyendo} onClick={() => { tic(); onLeer(); }}>
        {leyendo ? t('lector.leyendo') : t('lector.boton')}
      </button>
      {conAuto && <BotonLeerSolo lector={lector} />}
      {estadoAuto && !aviso && <p className="lector-estado">{estadoAuto}</p>}
      {aviso && <p className="lector-aviso" role="alert">{t(claveDeFallo(aviso))}</p>}
    </>
  );
}

/** El interruptor «Leer solo». */
export function BotonLeerSolo({ lector, style }) {
  const t = useT();
  return (
    <button className="reset lector-auto" style={style} aria-pressed={lector.auto} onClick={() => { tic(); lector.onAuto(!lector.auto); }}>
      {t(lector.auto ? 'lector.autoSi' : 'lector.autoNo')}
    </button>
  );
}
